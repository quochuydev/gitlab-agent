import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";
import { GitHubService } from "./github-service";
import { GuidelinesScanner } from "./guidelines-scanner";

// Create logger for AI review service
const logger = createPinoLogger({
  name: "ai-review-service",
  level: configuration.logging.level as any,
});

export interface CodeReviewResult {
  fileName: string;
  language: string;
  overallScore: number;
  canMerge: boolean;
  summary: string;
  inlineComments: Array<{
    line: number;
    message: string;
    severity: "info" | "warning" | "error";
    suggestion?: string;
  }>;
  issues: Array<{
    type: "security" | "performance" | "style" | "logic" | "maintainability";
    severity: "low" | "medium" | "high" | "critical";
    line: number;
    message: string;
    suggestion?: string;
  }>;
}

export interface PullRequestReview {
  overallScore: number;
  canMerge: boolean;
  summary: string;
  fileReviews: CodeReviewResult[];
  mergeDecision: {
    recommendation: "approve" | "request_changes" | "comment";
    reasons: string[];
  };
}

export class AIReviewService {
  private githubService: GitHubService;
  private guidelinesScanner: GuidelinesScanner;

  constructor(
    githubService: GitHubService,
    guidelinesScanner: GuidelinesScanner
  ) {
    this.githubService = githubService;
    this.guidelinesScanner = guidelinesScanner;

    if (!configuration.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is required for AI review service");
    }

    logger.info("AI Review Service initialized", {
      openaiConfigured: !!configuration.openai.apiKey,
    });
  }

  /**
   * Review a single file using OpenAI GPT
   */
  async reviewFile(
    filePath: string,
    content: string,
    guidelines: string = ""
  ): Promise<CodeReviewResult> {
    logger.debug("Starting AI file review", {
      filePath,
      contentLength: content.length,
    });

    try {
      const language = this.detectLanguage(filePath);
      const relevantGuidelines =
        await this.guidelinesScanner.getGuidelinesForLanguage(language);
      const guidelinesText =
        this.guidelinesScanner.formatGuidelinesForPrompt(relevantGuidelines);

      const prompt = `You are an expert code reviewer. Review this ${language} file and provide detailed feedback.

${guidelinesText}

## FILE TO REVIEW
File: ${filePath}
Language: ${language}

\`\`\`${language}
${content}
\`\`\`

## REVIEW REQUIREMENTS
Provide a comprehensive code review focusing on:
1. Security vulnerabilities (hardcoded secrets, SQL injection, XSS, etc.)
2. Performance issues (inefficient algorithms, memory leaks, etc.)
3. Code style and best practices
4. Logic errors and potential bugs
5. Maintainability and readability

## RESPONSE FORMAT
Return your response as a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "canMerge": <boolean>,
  "summary": "<brief 2-3 sentence summary>",
  "inlineComments": [
    {
      "line": <line_number>,
      "message": "<specific issue description>",
      "severity": "info|warning|error",
      "suggestion": "<optional fix suggestion>"
    }
  ],
  "issues": [
    {
      "type": "security|performance|style|logic|maintainability",
      "severity": "low|medium|high|critical",
      "line": <line_number>,
      "message": "<detailed issue description>",
      "suggestion": "<how to fix>"
    }
  ]
}

Scoring guidelines:
- 90-100: Excellent code, minor or no issues
- 80-89: Good code, some improvements needed
- 70-79: Acceptable code, several issues to address
- 60-69: Poor code, significant problems
- Below 60: Critical issues, must fix before merge

Set canMerge to false if there are critical security issues or major bugs.`;

      const result = await generateText({
        model: openai("gpt-4o"),
        prompt,
        maxTokens: 4000,
        temperature: 0.1,
      });

      logger.debug("Received AI review response", {
        filePath,
        responseLength: result.text.length,
      });

      // Parse the JSON response
      const reviewData = JSON.parse(result.text);

      const fileReview: CodeReviewResult = {
        fileName: filePath,
        language,
        overallScore: reviewData.overallScore,
        canMerge: reviewData.canMerge,
        summary: reviewData.summary,
        inlineComments: reviewData.inlineComments || [],
        issues: reviewData.issues || [],
      };

      logger.info("File review completed", {
        filePath,
        score: fileReview.overallScore,
        canMerge: fileReview.canMerge,
        issuesFound: fileReview.issues.length,
        inlineCommentsCount: fileReview.inlineComments.length,
      });

      return fileReview;
    } catch (error) {
      logger.error("Error during AI file review", {
        filePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Return a fallback review
      return {
        fileName: filePath,
        language: this.detectLanguage(filePath),
        overallScore: 50,
        canMerge: false,
        summary:
          "Review failed due to AI service error. Manual review required.",
        inlineComments: [],
        issues: [
          {
            type: "maintainability",
            severity: "high",
            line: 1,
            message:
              "AI review service encountered an error. Please review manually.",
            suggestion: "Check logs for detailed error information.",
          },
        ],
      };
    }
  }

  /**
   * Review an entire pull request
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestReview> {
    logger.info("Starting pull request review", { owner, repo, pullNumber });

    try {
      // Fetch pull request details
      const pullRequest = await this.githubService.getPullRequest(
        owner,
        repo,
        pullNumber
      );

      if (!pullRequest.changedFiles || pullRequest.changedFiles.length === 0) {
        logger.warn("No changed files found in PR", {
          owner,
          repo,
          pullNumber,
        });

        return {
          overallScore: 100,
          canMerge: true,
          summary: "No code changes to review.",
          fileReviews: [],
          mergeDecision: {
            recommendation: "approve",
            reasons: ["No code changes detected"],
          },
        };
      }

      // Review each changed file
      const fileReviews: CodeReviewResult[] = [];

      for (const file of pullRequest.changedFiles) {
        // Skip non-code files
        if (!this.isCodeFile(file.path)) {
          logger.debug("Skipping non-code file", { filePath: file.path });
          continue;
        }

        logger.debug("Reviewing file", { filePath: file.path });
        const review = await this.reviewFile(file.path, file.content);
        fileReviews.push(review);
      }

      if (fileReviews.length === 0) {
        return {
          overallScore: 100,
          canMerge: true,
          summary: "No code files to review in this PR.",
          fileReviews: [],
          mergeDecision: {
            recommendation: "approve",
            reasons: ["No code files changed"],
          },
        };
      }

      // Calculate overall PR score and decision
      const overallScore = this.calculateOverallScore(fileReviews);
      const canMerge = this.canMergePR(fileReviews);
      const summary = this.generatePRSummary(fileReviews, overallScore);
      const mergeDecision = this.getMergeDecision(fileReviews, overallScore);

      const prReview: PullRequestReview = {
        overallScore,
        canMerge,
        summary,
        fileReviews,
        mergeDecision,
      };

      logger.info("Pull request review completed", {
        owner,
        repo,
        pullNumber,
        overallScore,
        canMerge,
        filesReviewed: fileReviews.length,
        recommendation: mergeDecision.recommendation,
      });

      return prReview;
    } catch (error) {
      logger.error("Error during pull request review", {
        owner,
        repo,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to review pull request: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Post review comments to GitHub PR
   */
  async postReviewToGitHub(
    owner: string,
    repo: string,
    pullNumber: number,
    review: PullRequestReview
  ): Promise<void> {
    logger.info("Posting review to GitHub", { owner, repo, pullNumber });

    try {
      // Create main PR comment with overall score and summary
      const prComment = this.formatPRComment(review);

      await this.githubService.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: prComment,
      });

      // Post inline comments for each file
      const reviewComments = [];

      for (const fileReview of review.fileReviews) {
        for (const comment of fileReview.inlineComments) {
          reviewComments.push({
            path: fileReview.fileName,
            line: comment.line,
            body: `**${comment.severity.toUpperCase()}**: ${comment.message}${
              comment.suggestion
                ? `\n\n**Suggestion**: ${comment.suggestion}`
                : ""
            }`,
          });
        }
      }

      if (reviewComments.length > 0) {
        // Get the latest commit SHA
        const pullData = await this.githubService.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        });

        await this.githubService.octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: pullData.data.head.sha,
          event:
            review.mergeDecision.recommendation === "approve"
              ? "APPROVE"
              : review.mergeDecision.recommendation === "request_changes"
              ? "REQUEST_CHANGES"
              : "COMMENT",
          comments: reviewComments,
        });
      }

      logger.info("Review posted to GitHub successfully", {
        owner,
        repo,
        pullNumber,
        mainComment: true,
        inlineComments: reviewComments.length,
      });
    } catch (error) {
      logger.error("Failed to post review to GitHub", {
        owner,
        repo,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private detectLanguage(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      java: "java",
      go: "go",
      rs: "rust",
      cpp: "cpp",
      c: "c",
      php: "php",
      rb: "ruby",
      cs: "csharp",
      swift: "swift",
      kt: "kotlin",
    };
    return langMap[ext || ""] || "unknown";
  }

  private isCodeFile(fileName: string): boolean {
    const codeExtensions = [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".cpp",
      ".c",
      ".h",
      ".hpp",
      ".php",
      ".rb",
      ".cs",
      ".swift",
      ".kt",
    ];
    return codeExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
  }

  private calculateOverallScore(fileReviews: CodeReviewResult[]): number {
    if (fileReviews.length === 0) return 100;

    const totalScore = fileReviews.reduce(
      (sum, review) => sum + review.overallScore,
      0
    );
    return Math.round(totalScore / fileReviews.length);
  }

  private canMergePR(fileReviews: CodeReviewResult[]): boolean {
    return fileReviews.every((review) => review.canMerge);
  }

  private generatePRSummary(
    fileReviews: CodeReviewResult[],
    overallScore: number
  ): string {
    const criticalIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "critical").length;
    const highIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "high").length;

    if (overallScore >= 90) {
      return `Excellent code quality! Score: ${overallScore}/100. Ready to merge.`;
    } else if (overallScore >= 80) {
      return `Good code quality with minor improvements needed. Score: ${overallScore}/100.`;
    } else if (overallScore >= 70) {
      return `Acceptable code quality but several issues should be addressed. Score: ${overallScore}/100.`;
    } else if (criticalIssues > 0) {
      return `Critical security or logic issues found. Score: ${overallScore}/100. Must fix before merge.`;
    } else {
      return `Code quality needs significant improvement. Score: ${overallScore}/100.`;
    }
  }

  private getMergeDecision(
    fileReviews: CodeReviewResult[],
    overallScore: number
  ): {
    recommendation: "approve" | "request_changes" | "comment";
    reasons: string[];
  } {
    const reasons: string[] = [];
    const criticalIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "critical");
    const highIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "high");

    if (criticalIssues.length > 0) {
      reasons.push(
        `${criticalIssues.length} critical security/logic issues found`
      );
      return { recommendation: "request_changes", reasons };
    }

    if (overallScore < 60) {
      reasons.push(`Overall code quality score too low: ${overallScore}/100`);
      return { recommendation: "request_changes", reasons };
    }

    if (highIssues.length > 3) {
      reasons.push(`Too many high-severity issues: ${highIssues.length}`);
      return { recommendation: "request_changes", reasons };
    }

    if (overallScore >= 80) {
      reasons.push(`High code quality score: ${overallScore}/100`);
      return { recommendation: "approve", reasons };
    }

    reasons.push(
      `Moderate code quality, consider addressing issues before merge`
    );
    return { recommendation: "comment", reasons };
  }

  private formatPRComment(review: PullRequestReview): string {
    const { overallScore, canMerge, summary, fileReviews, mergeDecision } =
      review;

    const criticalCount = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "critical").length;
    const highCount = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "high").length;
    const mediumCount = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "medium").length;

    const mergeEmoji = canMerge ? "✅" : "❌";
    const scoreEmoji =
      overallScore >= 90 ? "🟢" : overallScore >= 70 ? "🟡" : "🔴";

    return `## 🤖 AI Code Review

${scoreEmoji} **Overall Score: ${overallScore}/100** ${mergeEmoji} **${
      canMerge ? "Ready to Merge" : "Changes Requested"
    }**

### Summary
${summary}

### Issues Found
- 🚨 Critical: ${criticalCount}
- ⚠️ High: ${highCount}  
- 📋 Medium: ${mediumCount}

### Files Reviewed: ${fileReviews.length}
${fileReviews
  .map(
    (file) =>
      `- **${file.fileName}** (${file.language}): ${file.overallScore}/100 ${
        file.canMerge ? "✅" : "❌"
      }`
  )
  .join("\n")}

### Recommendation: ${mergeDecision.recommendation
      .toUpperCase()
      .replace("_", " ")}
${mergeDecision.reasons.map((reason) => `- ${reason}`).join("\n")}

---
*Generated by AI Code Review Service*`;
  }

  /**
   * Review push/commit changes using AI
   */
  async reviewPushCommits(
    owner: string,
    repo: string,
    commits: any[],
    ref: string
  ): Promise<{
    overallScore: number;
    summary: string;
    fileReviews: CodeReviewResult[];
    criticalIssues: number;
    recommendations: string[];
  }> {
    logger.info("Starting AI-powered push review", {
      owner,
      repo,
      ref,
      commitCount: commits.length,
    });

    try {
      // Collect all modified/added files from commits
      const filesToAnalyze = new Set<string>();

      for (const commit of commits) {
        // Add modified files
        if (commit.modified) {
          commit.modified.forEach((file: string) => {
            if (this.isCodeFile(file)) {
              filesToAnalyze.add(file);
            }
          });
        }

        // Add new files
        if (commit.added) {
          commit.added.forEach((file: string) => {
            if (this.isCodeFile(file)) {
              filesToAnalyze.add(file);
            }
          });
        }
      }

      if (filesToAnalyze.size === 0) {
        return {
          overallScore: 100,
          summary: "No code files changed in this push.",
          fileReviews: [],
          criticalIssues: 0,
          recommendations: ["No code changes to review"],
        };
      }

      logger.info("Files to analyze from push", {
        owner,
        repo,
        ref,
        totalFiles: filesToAnalyze.size,
        files: Array.from(filesToAnalyze),
      });

      // Fetch and review each file
      const fileReviews: CodeReviewResult[] = [];

      for (const filePath of filesToAnalyze) {
        try {
          // Get latest commit SHA from push
          const latestCommitSha = commits[commits.length - 1]?.id || ref;

          logger.debug("Fetching file content for push analysis", {
            owner,
            repo,
            file: filePath,
            sha: latestCommitSha,
          });

          const fileContent = await this.githubService.getRepositoryFile(
            owner,
            repo,
            filePath,
            latestCommitSha
          );

          // Review the file with AI
          const review = await this.reviewFile(filePath, fileContent.content);
          fileReviews.push(review);
        } catch (error) {
          logger.warn("Could not fetch/review file in push", {
            owner,
            repo,
            file: filePath,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      // Calculate overall statistics
      const overallScore = this.calculateOverallScore(fileReviews);
      const criticalIssues = fileReviews
        .flatMap((r) => r.issues)
        .filter((i) => i.severity === "critical").length;

      const summary = this.generatePushSummary(
        fileReviews,
        overallScore,
        commits.length
      );
      const recommendations = this.generatePushRecommendations(fileReviews);

      logger.info("Push review completed", {
        owner,
        repo,
        ref,
        filesAnalyzed: fileReviews.length,
        overallScore,
        criticalIssues,
      });

      return {
        overallScore,
        summary,
        fileReviews,
        criticalIssues,
        recommendations,
      };
    } catch (error) {
      logger.error("Error during push review", {
        owner,
        repo,
        ref,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to review push commits: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Post push review as commit comment
   */
  async postPushReviewToGitHub(
    owner: string,
    repo: string,
    commitSha: string,
    pushReview: {
      overallScore: number;
      summary: string;
      fileReviews: CodeReviewResult[];
      criticalIssues: number;
      recommendations: string[];
    },
    ref: string
  ): Promise<void> {
    logger.info("Posting push review to GitHub", {
      owner,
      repo,
      commitSha,
      ref,
    });

    try {
      const comment = this.formatPushComment(pushReview, ref);

      await this.githubService.octokit.rest.repos.createCommitComment({
        owner,
        repo,
        commit_sha: commitSha,
        body: comment,
      });

      logger.info("Push review posted to GitHub successfully", {
        owner,
        repo,
        commitSha,
        score: pushReview.overallScore,
        criticalIssues: pushReview.criticalIssues,
      });
    } catch (error) {
      logger.error("Failed to post push review to GitHub", {
        owner,
        repo,
        commitSha,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private generatePushSummary(
    fileReviews: CodeReviewResult[],
    overallScore: number,
    commitCount: number
  ): string {
    const criticalIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "critical").length;

    if (criticalIssues > 0) {
      return `🚨 Critical issues detected in ${commitCount} commit${
        commitCount > 1 ? "s" : ""
      }! Score: ${overallScore}/100. Immediate action required.`;
    } else if (overallScore >= 90) {
      return `✅ Excellent code quality in push! Score: ${overallScore}/100. Clean commits.`;
    } else if (overallScore >= 80) {
      return `🟡 Good code quality with minor improvements needed. Score: ${overallScore}/100.`;
    } else if (overallScore >= 70) {
      return `🟠 Several code quality issues found. Score: ${overallScore}/100. Consider addressing before next release.`;
    } else {
      return `🔴 Significant code quality issues detected. Score: ${overallScore}/100. Review and improve recommended.`;
    }
  }

  private generatePushRecommendations(
    fileReviews: CodeReviewResult[]
  ): string[] {
    const recommendations: string[] = [];
    const criticalIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "critical");
    const highIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "high");
    const securityIssues = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.type === "security");

    if (criticalIssues.length > 0) {
      recommendations.push(
        `Fix ${criticalIssues.length} critical issue${
          criticalIssues.length > 1 ? "s" : ""
        } immediately`
      );
    }

    if (securityIssues.length > 0) {
      recommendations.push(
        `Address ${securityIssues.length} security concern${
          securityIssues.length > 1 ? "s" : ""
        }`
      );
    }

    if (highIssues.length > 2) {
      recommendations.push(
        `Consider refactoring files with multiple high-severity issues`
      );
    }

    const lowScoreFiles = fileReviews.filter((r) => r.overallScore < 70);
    if (lowScoreFiles.length > 0) {
      recommendations.push(
        `Review code quality in: ${lowScoreFiles
          .map((f) => f.fileName)
          .join(", ")}`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Code quality looks good! Keep up the excellent work."
      );
    }

    return recommendations;
  }

  private formatPushComment(
    pushReview: {
      overallScore: number;
      summary: string;
      fileReviews: CodeReviewResult[];
      criticalIssues: number;
      recommendations: string[];
    },
    ref: string
  ): string {
    const {
      overallScore,
      summary,
      fileReviews,
      criticalIssues,
      recommendations,
    } = pushReview;

    const highCount = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "high").length;
    const mediumCount = fileReviews
      .flatMap((r) => r.issues)
      .filter((i) => i.severity === "medium").length;

    const scoreEmoji =
      overallScore >= 90 ? "🟢" : overallScore >= 70 ? "🟡" : "🔴";
    const branch = ref.replace("refs/heads/", "");

    return `## 🤖 AI Code Review - Push to \`${branch}\`

${scoreEmoji} **Overall Score: ${overallScore}/100** ${
      criticalIssues > 0 ? "🚨" : "✅"
    }

### Summary
${summary}

### Issues Found
- 🚨 Critical: ${criticalIssues}
- ⚠️ High: ${highCount}
- 📋 Medium: ${mediumCount}

### Files Analyzed: ${fileReviews.length}
${fileReviews
  .map(
    (file) =>
      `- **${file.fileName}** (${file.language}): ${file.overallScore}/100 ${
        file.issues.some((i) => i.severity === "critical")
          ? "🚨"
          : file.overallScore >= 80
          ? "✅"
          : "⚠️"
      }`
  )
  .join("\n")}

### Recommendations
${recommendations.map((rec) => `- ${rec}`).join("\n")}

${
  criticalIssues > 0
    ? "\n⚠️ **Critical issues require immediate attention before production deployment!**"
    : ""
}

---
*Generated by AI Code Review Service*`;
  }
}
