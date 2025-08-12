import { anthropic } from "@ai-sdk/anthropic";
import { Agent, VoltAgent, createTool } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { z } from "zod";
import { GitLabService } from "./gitlab-service";
import { GitHubService } from "./github-service";
import { GuidelinesScanner } from "./guidelines-scanner";
import { configuration } from "./configulation";

// Create logger for main agent
const mainLogger = createPinoLogger({
  name: "gitlab-code-reviewer-main",
  level: configuration.logging.level as any,
});

// Initialize services
mainLogger.info("Initializing services");
const gitlabService = new GitLabService();
const githubService = new GitHubService();
const guidelinesScanner = new GuidelinesScanner();
mainLogger.info("Services initialized successfully");

// Helper functions for code analysis
const detectLanguageFromFilename = (fileName: string): string => {
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
};

const analyzeCodeWithGuidelines = (
  code: string,
  fileName: string,
  guidelines: any[]
): any[] => {
  mainLogger.debug("Starting code analysis", {
    fileName,
    codeLength: code.length,
    linesCount: code.split("\n").length,
    guidelinesCount: guidelines.length,
  });

  const issues: any[] = [];

  // Basic static analysis based on common patterns
  const lines = code.split("\n");

  // Check for common issues
  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for console.log in production code
    if (line.includes("console.log") && !fileName.includes("test")) {
      mainLogger.debug("Found console.log issue", { fileName, lineNum });
      issues.push({
        type: "warning",
        line: lineNum,
        message:
          "Console.log statement found - should be removed for production",
        severity: "medium",
        guidelineViolation: true,
        guidelineReference: "javascript/best-practices.md",
      });
    }

    // Check for hardcoded secrets
    if (line.match(/(api[_-]?key|password|secret|token)\s*[:=]\s*['"]/i)) {
      mainLogger.warn("Found potential hardcoded secret", {
        fileName,
        lineNum,
      });
      issues.push({
        type: "security",
        line: lineNum,
        message: "Potential hardcoded secret detected",
        severity: "high",
        guidelineViolation: true,
        guidelineReference: "security/common-vulnerabilities.md",
      });
    }

    // Check for missing type annotations in TypeScript
    if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) {
      if (
        line.match(/function\s+\w+\s*\([^)]*\)\s*\{/) &&
        !line.includes(":")
      ) {
        mainLogger.debug("Found missing type annotation issue", {
          fileName,
          lineNum,
        });
        issues.push({
          type: "style",
          line: lineNum,
          message: "Missing return type annotation",
          severity: "medium",
          guidelineViolation: true,
          guidelineReference: "typescript/patterns.md",
        });
      }
    }
  });

  mainLogger.debug("Code analysis completed", {
    fileName,
    totalIssues: issues.length,
    issueTypes: issues.reduce((acc: any, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {}),
    severityBreakdown: issues.reduce((acc: any, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {}),
  });

  return issues;
};

const calculateScore = (issues: any[]): number => {
  mainLogger.debug("Calculating quality score", { issueCount: issues.length });

  let score = 100;
  issues.forEach((issue) => {
    switch (issue.severity) {
      case "high":
        score -= 20;
        break;
      case "medium":
        score -= 10;
        break;
      case "low":
        score -= 5;
        break;
    }
  });

  const finalScore = Math.max(0, score);
  mainLogger.debug("Quality score calculated", {
    initialScore: 100,
    finalScore,
    deduction: 100 - finalScore,
  });

  return finalScore;
};

const generateRecommendations = (
  issues: any[],
  guidelines: any[]
): string[] => {
  const recommendations = [];

  if (issues.some((i) => i.type === "security")) {
    recommendations.push(
      "Review security practices and implement proper input validation"
    );
  }

  if (issues.some((i) => i.type === "style")) {
    recommendations.push(
      "Follow coding style guidelines and add proper type annotations"
    );
  }

  if (issues.length === 0) {
    recommendations.push(
      "Code looks good! Consider adding more comprehensive tests"
    );
  }

  return recommendations;
};

const fetchRepositoryTool = createTool({
  name: "fetch_repository_files",
  description: "Fetch files from a GitLab repository for code review",
  parameters: z.object({
    projectId: z.string().describe("GitLab project ID or path"),
    branch: z.string().optional().describe("Branch name (defaults to main)"),
    filePath: z.string().optional().describe("Specific file path to fetch"),
  }),
  execute: async (input) => {
    mainLogger.info("Executing fetch_repository_files tool", input);

    try {
      const { projectId, branch = "main", filePath } = input;

      if (filePath) {
        // Fetch a specific file
        mainLogger.debug("Fetching specific file", {
          projectId,
          filePath,
          branch,
        });
        const file = await gitlabService.getRepositoryFile(
          projectId,
          filePath,
          branch
        );

        const result = {
          projectId,
          branch,
          files: [file],
        };

        mainLogger.info("Successfully fetched specific file", {
          projectId,
          filePath,
          branch,
          fileSize: file.size,
        });

        return result;
      } else {
        // Get repository tree
        mainLogger.debug("Fetching repository tree", { projectId, branch });
        const tree = await gitlabService.getRepositoryTree(projectId, branch);
        const codeFiles = tree
          .filter(
            (item) =>
              item.type === "blob" &&
              /\.(js|ts|tsx|jsx|py|java|go|rs|cpp|c|h|hpp|php|rb|cs|swift|kt)$/.test(
                item.path
              )
          )
          .slice(0, 10); // Limit to first 10 files to avoid overload

        mainLogger.debug("Filtered code files from tree", {
          projectId,
          branch,
          totalTreeItems: tree.length,
          codeFilesCount: codeFiles.length,
          codeFiles: codeFiles.map((f) => f.path),
        });

        const files = await Promise.all(
          codeFiles.map(async (fileInfo) => {
            try {
              return await gitlabService.getRepositoryFile(
                projectId,
                fileInfo.path,
                branch
              );
            } catch (error) {
              mainLogger.warn("Could not fetch code file", {
                projectId,
                filePath: fileInfo.path,
                branch,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              return null;
            }
          })
        );

        const result = {
          projectId,
          branch,
          files: files.filter(Boolean),
        };

        mainLogger.info("Successfully fetched repository files", {
          projectId,
          branch,
          requestedFiles: codeFiles.length,
          successfulFiles: result.files.length,
        });

        return result;
      }
    } catch (error) {
      mainLogger.error("Failed to execute fetch_repository_files tool", {
        input,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to fetch repository files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const fetchGitHubRepositoryTool = createTool({
  name: "fetch_github_repository_files",
  description: "Fetch files from a GitHub repository for code review",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    ref: z.string().optional().describe("Branch/ref name (defaults to main)"),
    filePath: z.string().optional().describe("Specific file path to fetch"),
  }),
  execute: async (input) => {
    mainLogger.info("Executing fetch_github_repository_files tool", input);
    
    try {
      const { owner, repo, ref = "main", filePath } = input;

      if (filePath) {
        // Fetch a specific file
        mainLogger.debug("Fetching specific GitHub file", {
          owner,
          repo,
          filePath,
          ref,
        });
        const file = await githubService.getRepositoryFile(
          owner,
          repo,
          filePath,
          ref
        );
        
        const result = {
          owner,
          repo,
          ref,
          files: [file],
        };
        
        mainLogger.info("Successfully fetched specific GitHub file", {
          owner,
          repo,
          filePath,
          ref,
          fileSize: file.size
        });
        
        return result;
      } else {
        // Get repository tree
        mainLogger.debug("Fetching GitHub repository tree", { owner, repo, ref });
        const tree = await githubService.getRepositoryTree(owner, repo, ref);
        const codeFiles = tree
          .filter(
            (item) =>
              item.type === "blob" &&
              /\.(js|ts|tsx|jsx|py|java|go|rs|cpp|c|h|hpp|php|rb|cs|swift|kt)$/.test(
                item.path
              )
          )
          .slice(0, 10); // Limit to first 10 files to avoid overload

        mainLogger.debug("Filtered code files from GitHub tree", {
          owner,
          repo,
          ref,
          totalTreeItems: tree.length,
          codeFilesCount: codeFiles.length,
          codeFiles: codeFiles.map((f) => f.path),
        });

        const files = await Promise.all(
          codeFiles.map(async (fileInfo) => {
            try {
              return await githubService.getRepositoryFile(
                owner,
                repo,
                fileInfo.path,
                ref
              );
            } catch (error) {
              mainLogger.warn("Could not fetch GitHub code file", {
                owner,
                repo,
                filePath: fileInfo.path,
                ref,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              return null;
            }
          })
        );

        const result = {
          owner,
          repo,
          ref,
          files: files.filter(Boolean),
        };
        
        mainLogger.info("Successfully fetched GitHub repository files", {
          owner,
          repo,
          ref,
          requestedFiles: codeFiles.length,
          successfulFiles: result.files.length
        });
        
        return result;
      }
    } catch (error) {
      mainLogger.error("Failed to execute fetch_github_repository_files tool", {
        input,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      
      throw new Error(
        `Failed to fetch GitHub repository files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const reviewCodeTool = createTool({
  name: "review_code",
  description:
    "Analyze code files and provide comprehensive review feedback using Claude API and internal guidelines",
  parameters: z.object({
    code: z.string().describe("The code content to review"),
    fileName: z.string().describe("The name of the file being reviewed"),
    language: z
      .string()
      .optional()
      .describe("Programming language of the code"),
    reviewType: z
      .enum(["security", "performance", "style", "all"])
      .optional()
      .describe("Type of review to perform"),
  }),
  execute: async (input) => {
    const { code, fileName, language, reviewType = "all" } = input;

    mainLogger.info("Executing review_code tool", {
      fileName,
      language,
      reviewType,
      codeLength: code.length,
    });

    try {
      // Get language from file extension if not provided
      const detectedLanguage = language || detectLanguageFromFilename(fileName);

      mainLogger.debug("Language detected for code review", {
        fileName,
        providedLanguage: language,
        detectedLanguage,
      });

      // Fetch relevant guidelines
      const guidelines = await guidelinesScanner.getGuidelinesForLanguage(
        detectedLanguage
      );

      mainLogger.debug("Guidelines fetched for code review", {
        fileName,
        detectedLanguage,
        guidelinesCount: guidelines.length,
        categories: guidelines.map((g) => g.category),
      });

      const guidelinesText =
        guidelinesScanner.formatGuidelinesForPrompt(guidelines);

      // Create comprehensive review prompt with guidelines
      const reviewPrompt = `${guidelinesText}

# CODE TO REVIEW

File: ${fileName}
Language: ${detectedLanguage}
Review Focus: ${reviewType === "all" ? "Comprehensive review" : reviewType}

Please review this code according to the guidelines above and provide detailed feedback on:
${
  reviewType === "all"
    ? "- Code quality and best practices\n- Security vulnerabilities\n- Performance optimizations\n- Style and formatting\n- Potential bugs and improvements"
    : `- ${reviewType} aspects based on the relevant guidelines`
}

Code:
\`\`\`${detectedLanguage}
${code}
\`\`\`

Please provide:
1. A summary of the code review
2. Specific issues found with line numbers and severity
3. Recommendations for improvement
4. A quality score out of 100
5. Reference to which guidelines were violated (if any)`;

      // For now, return structured mock response with guidelines context
      // In production, this would make actual Claude API call
      mainLogger.debug("Starting code analysis with guidelines", {
        fileName,
        detectedLanguage,
        reviewType,
        guidelinesCount: guidelines.length,
      });

      const issues = analyzeCodeWithGuidelines(code, fileName, guidelines);
      const score = calculateScore(issues);
      const recommendations = generateRecommendations(issues, guidelines);

      const result = {
        fileName,
        language: detectedLanguage,
        reviewType,
        guidelinesUsed: guidelines.map((g) => `${g.category}/${g.filename}`),
        feedback: {
          summary: `Code review completed for ${fileName} using ${guidelines.length} relevant guidelines`,
          issues,
          score,
          recommendations,
          guidelinesViolated: issues
            .filter((issue) => issue.guidelineViolation)
            .map((issue) => issue.guidelineReference)
            .filter(Boolean),
        },
      };

      mainLogger.info("Code review completed successfully", {
        fileName,
        detectedLanguage,
        reviewType,
        issuesFound: issues.length,
        score,
        guidelinesUsed: guidelines.length,
        recommendationsCount: recommendations.length,
      });

      return result;
    } catch (error) {
      mainLogger.error("Failed to execute review_code tool", {
        fileName,
        language,
        reviewType,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to review code: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const getMergeRequestTool = createTool({
  name: "get_merge_request",
  description: "Fetch merge request details and changed files for review",
  parameters: z.object({
    projectId: z.string().describe("GitLab project ID"),
    mergeRequestId: z.number().describe("Merge request ID"),
  }),
  execute: async (input) => {
    mainLogger.info("Executing get_merge_request tool", input);

    try {
      const mergeRequest = await gitlabService.getMergeRequest(
        input.projectId,
        input.mergeRequestId
      );

      mainLogger.info("Successfully fetched merge request", {
        projectId: input.projectId,
        mergeRequestId: input.mergeRequestId,
        title: mergeRequest.title,
        status: mergeRequest.status,
        changedFilesCount: mergeRequest.changedFiles?.length || 0,
      });

      return mergeRequest;
    } catch (error) {
      mainLogger.error("Failed to execute get_merge_request tool", {
        input,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to fetch merge request: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const getGitHubPullRequestTool = createTool({
  name: "get_github_pull_request",
  description: "Fetch GitHub pull request details and changed files for review",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    pullNumber: z.number().describe("Pull request number"),
  }),
  execute: async (input) => {
    mainLogger.info("Executing get_github_pull_request tool", input);
    
    try {
      const pullRequest = await githubService.getPullRequest(
        input.owner,
        input.repo,
        input.pullNumber
      );
      
      mainLogger.info("Successfully fetched GitHub pull request", {
        owner: input.owner,
        repo: input.repo,
        pullNumber: input.pullNumber,
        title: pullRequest.title,
        status: pullRequest.status,
        changedFilesCount: pullRequest.changedFiles?.length || 0
      });
      
      return pullRequest;
    } catch (error) {
      mainLogger.error("Failed to execute get_github_pull_request tool", {
        input,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      throw new Error(
        `Failed to fetch GitHub pull request: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const scanGuidelinesTool = createTool({
  name: "scan_guidelines",
  description:
    "Scan and load coding guidelines for specific languages or categories",
  parameters: z.object({
    language: z
      .string()
      .optional()
      .describe("Programming language to get guidelines for"),
    category: z
      .string()
      .optional()
      .describe("Specific category like 'security', 'performance'"),
  }),
  execute: async (input) => {
    mainLogger.info("Executing scan_guidelines tool", input);

    try {
      const { language, category } = input;

      if (language) {
        mainLogger.debug("Scanning guidelines for language", { language });
        const guidelines = await guidelinesScanner.getGuidelinesForLanguage(
          language
        );

        const result = {
          language,
          guidelinesCount: guidelines.length,
          guidelines: guidelines.map((g) => ({
            category: g.category,
            filename: g.filename,
            summary: g.content.substring(0, 200) + "...",
          })),
          available: true,
        };

        mainLogger.info("Successfully scanned guidelines for language", {
          language,
          guidelinesCount: guidelines.length,
        });

        return result;
      }

      if (category) {
        mainLogger.debug("Scanning guidelines for category", { category });
        const guidelines = await guidelinesScanner.getGuidelinesByCategory(
          category
        );

        const result = {
          category,
          guidelinesCount: guidelines.length,
          guidelines: guidelines.map((g) => ({
            category: g.category,
            filename: g.filename,
            summary: g.content.substring(0, 200) + "...",
          })),
          available: true,
        };

        mainLogger.info("Successfully scanned guidelines for category", {
          category,
          guidelinesCount: guidelines.length,
        });

        return result;
      }

      mainLogger.debug("Scanning all available categories and guidelines");
      const categories = await guidelinesScanner.getAvailableCategories();
      const allGuidelines = await guidelinesScanner.scanAllGuidelines();

      const result = {
        availableCategories: categories,
        totalGuidelines: allGuidelines.length,
      };

      mainLogger.info("Successfully scanned all guidelines", {
        categoriesCount: categories.length,
        totalGuidelines: allGuidelines.length,
        categories,
      });

      return result;
    } catch (error) {
      mainLogger.error("Failed to execute scan_guidelines tool", {
        input,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to scan guidelines: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const codeReviewAgent = new Agent({
  name: "multi-platform-code-reviewer",
  description:
    "A specialized code review agent that analyzes repository code from GitLab and GitHub, merge/pull requests, and provides comprehensive feedback using Claude API and internal coding guidelines",
  llm: new VercelAIProvider(),
  model: anthropic("claude-sonnet-4-20250514"),
  tools: [
    fetchRepositoryTool,
    fetchGitHubRepositoryTool,
    reviewCodeTool,
    getMergeRequestTool,
    getGitHubPullRequestTool,
    scanGuidelinesTool,
  ],
});

// Create logger
const logger = createPinoLogger({
  name: "multi-platform-code-reviewer",
  level: configuration.logging.level as any,
});

mainLogger.info("Initializing VoltAgent system", {
  agentName: "multi-platform-code-reviewer",
  toolsCount: 6,
  logLevel: configuration.logging.level,
});

new VoltAgent({
  agents: {
    "code-reviewer": codeReviewAgent,
  },
  logger,
});

mainLogger.info("VoltAgent system started successfully");
