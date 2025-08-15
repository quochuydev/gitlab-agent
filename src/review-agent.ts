// review-agent.ts - VoltAgent-based AI code review system
import { execSync } from "child_process";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { Agent, VoltAgent, createTool } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { createPinoLogger } from "@voltagent/logger";
import { z } from "zod";
import { GitHubService } from "./github-service";
import { GuidelinesScanner } from "./guidelines-scanner";
import { configuration } from "./configulation";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// === CONFIG ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GUIDELINES_PATH = path.join(__dirname, "guidelines");

// Initialize services
const reviewLogger = createPinoLogger({
  name: "review-agent",
  level: configuration.logging.level as any,
});

const githubService = new GitHubService();
const guidelinesScanner = new GuidelinesScanner();

// === TYPES ===
interface InlineComment {
  path: string;
  line: number;
  severity: string;
  type: string;
  quote: string;
  issue: string;
  recommendation: string;
}

interface ReviewResult {
  summary: string;
  score: number;
  generalComments: string;
  inlineComments: InlineComment[];
}

interface GitDiffResult {
  diff: string;
  linesChanged: number;
  hasChanges: boolean;
}

interface AIReviewResponse {
  review: ReviewResult;
  cost: number;
  score: number;
}

// === TOOL 1: Git Operations ===
const gitDiffTool = createTool({
  name: "get_git_diff",
  description: "Fetch git diff from main branch or between specific commits",
  parameters: z.object({
    baseBranch: z
      .string()
      .optional()
      .describe("Base branch to compare against (defaults to origin/main)"),
    targetBranch: z
      .string()
      .optional()
      .describe("Target branch to compare (defaults to current)"),
    fetchLatest: z
      .boolean()
      .optional()
      .describe("Whether to fetch latest changes first (defaults to true)"),
  }),
  execute: async (input): Promise<GitDiffResult> => {
    const {
      baseBranch = "origin/main",
      targetBranch = "",
      fetchLatest = true,
    } = input;

    reviewLogger.info("Executing git_diff tool", {
      baseBranch,
      targetBranch,
      fetchLatest,
    });

    try {
      let command = "";

      if (fetchLatest) {
        reviewLogger.debug("Fetching latest changes from origin");
        command = `git fetch origin main && `;
      }

      const diffCommand = targetBranch
        ? `git diff ${baseBranch}...${targetBranch}`
        : `git diff ${baseBranch}`;

      command += diffCommand;

      reviewLogger.debug("Executing git command", { command });

      const diff = execSync(command, { encoding: "utf8" });
      const linesChanged = diff.split("\n").length;
      const hasChanges = diff.trim().length > 0;

      const result: GitDiffResult = {
        diff,
        linesChanged,
        hasChanges,
      };

      reviewLogger.info("Git diff completed successfully", {
        baseBranch,
        targetBranch,
        hasChanges,
        linesChanged,
        diffLength: diff.length,
      });

      return result;
    } catch (error) {
      reviewLogger.error("Failed to execute git diff", {
        baseBranch,
        targetBranch,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to get git diff: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

const commitAnalysisTool = createTool({
  name: "analyze_commits",
  description: "Analyze commit history and extract metadata for review context",
  parameters: z.object({
    baseBranch: z
      .string()
      .optional()
      .describe("Base branch to compare against (defaults to origin/main)"),
    maxCommits: z
      .number()
      .optional()
      .describe("Maximum number of commits to analyze (defaults to 10)"),
  }),
  execute: async (input) => {
    const { baseBranch = "origin/main", maxCommits = 10 } = input;

    reviewLogger.info("Executing analyze_commits tool", {
      baseBranch,
      maxCommits,
    });

    try {
      const command = `git log ${baseBranch}..HEAD --oneline --no-merges -n ${maxCommits}`;

      reviewLogger.debug("Executing git log command", { command });

      const output = execSync(command, { encoding: "utf8" });
      const commits = output
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => {
          const [hash, ...messageParts] = line.split(" ");
          return {
            hash,
            message: messageParts.join(" "),
          };
        });

      // Get detailed info for each commit
      const detailedCommits = await Promise.all(
        commits.map(async (commit) => {
          try {
            const detailCommand = `git show --stat ${commit.hash} --format="%an|%ae|%ad|%s"`;
            const details = execSync(detailCommand, { encoding: "utf8" });
            const lines = details.split("\n");
            const [author, email, date, subject] = lines[0].split("|");

            const fileChanges = lines
              .slice(1)
              .filter(
                (line) =>
                  line.includes("|") &&
                  (line.includes("+") || line.includes("-"))
              )
              .map((line) => {
                const parts = line.trim().split("|");
                return {
                  file: parts[0].trim(),
                  changes: parts[1].trim(),
                };
              });

            return {
              ...commit,
              author: author?.trim(),
              email: email?.trim(),
              date: date?.trim(),
              subject: subject?.trim(),
              fileChanges,
            };
          } catch (error) {
            reviewLogger.warn("Failed to get commit details", {
              hash: commit.hash,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            return commit;
          }
        })
      );

      const result = {
        baseBranch,
        commitsCount: commits.length,
        commits: detailedCommits,
        summary: {
          totalCommits: commits.length,
          authors: [
            ...new Set(detailedCommits.map((c) => c.author).filter(Boolean)),
          ],
          hasBreakingChanges: detailedCommits.some(
            (c) =>
              c.message.toLowerCase().includes("breaking") ||
              c.message.toLowerCase().includes("major")
          ),
        },
      };

      reviewLogger.info("Commit analysis completed successfully", {
        baseBranch,
        commitsCount: commits.length,
        authorsCount: result.summary.authors.length,
        hasBreakingChanges: result.summary.hasBreakingChanges,
      });

      return result;
    } catch (error) {
      reviewLogger.error("Failed to analyze commits", {
        baseBranch,
        maxCommits,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to analyze commits: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// === TOOL 2: Guidelines Integration ===
const loadGuidelinesTool = createTool({
  name: "load_guidelines",
  description:
    "Load coding guidelines from scanner or fallback files for AI review",
  parameters: z.object({
    language: z
      .string()
      .optional()
      .describe("Specific programming language to load guidelines for"),
    category: z
      .string()
      .optional()
      .describe("Specific guideline category (security, performance, etc.)"),
    includeFallback: z
      .boolean()
      .optional()
      .describe("Whether to include fallback guidelines if scanner fails"),
  }),
  execute: async (input) => {
    const { language, category, includeFallback = true } = input;

    reviewLogger.info("Executing load_guidelines tool", {
      language,
      category,
      includeFallback,
    });

    try {
      let guidelines = "";
      let guidelinesCount = 0;
      let source = "unknown";

      try {
        // Try to use GuidelinesScanner first
        if (language) {
          const languageGuidelines =
            await guidelinesScanner.getGuidelinesForLanguage(language);
          guidelines =
            guidelinesScanner.formatGuidelinesForPrompt(languageGuidelines);
          guidelinesCount = languageGuidelines.length;
          source = "scanner-language";
        } else if (category) {
          const categoryGuidelines =
            await guidelinesScanner.getGuidelinesByCategory(category);
          guidelines =
            guidelinesScanner.formatGuidelinesForPrompt(categoryGuidelines);
          guidelinesCount = categoryGuidelines.length;
          source = "scanner-category";
        } else {
          const allGuidelines = await guidelinesScanner.scanAllGuidelines();
          guidelines =
            guidelinesScanner.formatGuidelinesForPrompt(allGuidelines);
          guidelinesCount = allGuidelines.length;
          source = "scanner-all";
        }
      } catch (scannerError) {
        reviewLogger.warn(
          "Failed to load guidelines from scanner, trying fallback",
          {
            scannerError:
              scannerError instanceof Error
                ? scannerError.message
                : "Unknown error",
          }
        );

        if (includeFallback) {
          // Fallback to reading guidelines file
          if (fs.existsSync(GUIDELINES_PATH)) {
            guidelines = fs.readFileSync(GUIDELINES_PATH, "utf8");
            guidelinesCount = 1;
            source = "file-fallback";
          } else {
            guidelines = `# Default Guidelines

- Follow clean code principles
- Use meaningful variable names
- Add proper error handling
- Include unit tests for new features
- Implement proper logging
- Follow security best practices
- Optimize for performance where needed
- Use consistent code formatting
- Add comprehensive documentation
- Handle edge cases appropriately`;
            guidelinesCount = 1;
            source = "default-fallback";
          }
        } else {
          throw scannerError;
        }
      }

      const result = {
        guidelines,
        guidelinesCount,
        source,
        language: language || "all",
        category: category || "all",
        length: guidelines.length,
      };

      reviewLogger.info("Guidelines loaded successfully", {
        source,
        guidelinesCount,
        language: language || "all",
        category: category || "all",
        guidelinesLength: guidelines.length,
      });

      return result;
    } catch (error) {
      reviewLogger.error("Failed to load guidelines", {
        language,
        category,
        includeFallback,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to load guidelines: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// === TOOL 3: AI Code Review ===
const aiCodeReviewTool = createTool({
  name: "ai_code_review",
  description:
    "Perform comprehensive AI-powered code review using OpenAI GPT with guidelines",
  parameters: z.object({
    diff: z.string().describe("Git diff content to review"),
    guidelines: z.string().describe("Coding guidelines to apply during review"),
    model: z
      .string()
      .optional()
      .describe("OpenAI model to use (defaults to gpt-4o-mini)"),
    temperature: z
      .number()
      .optional()
      .describe("Temperature for AI generation (defaults to 0.1)"),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe("Specific areas to focus on (security, performance, etc.)"),
  }),
  execute: async (input): Promise<AIReviewResponse> => {
    const {
      diff,
      guidelines,
      model = "gpt-4o-mini",
      temperature = 0.1,
      focusAreas = [],
    } = input;

    reviewLogger.info("Executing ai_code_review tool", {
      diffLength: diff.length,
      guidelinesLength: guidelines.length,
      model,
      temperature,
      focusAreas,
    });

    try {
      const focusSection =
        focusAreas.length > 0
          ? `\n\n## Specific Focus Areas:\n${focusAreas
              .map((area) => `- ${area}`)
              .join("\n")}`
          : "";

      const prompt = `You are a senior code reviewer with expertise in software engineering best practices.
Review the following git diff against these coding guidelines.

## Guidelines:

--------------------

${guidelines}

--------------------

## Code Diff:

--------------------

${diff}

--------------------

## For each issue you find, quote the specific problematic line(s) and provide actionable feedback.
${focusSection}

## Please provide your review in this exact JSON format:
{
  "summary": "Brief overview of the changes",
  "score": 85,
  "generalComments": "Overall feedback about the changes",
  "inlineComments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "severity": "high|medium|low",
      "type": "bug|security|performance|style|maintainability",
      "quote": "const password = 'hardcoded123';",
      "issue": "Hardcoded password found",
      "recommendation": "Use environment variables or secure configuration"
    }
  ]
}

## Focus on:
- Quote the exact problematic code lines
- Provide specific, actionable recommendations
- Identify security vulnerabilities, bugs, and code quality issues
- Suggest concrete improvements
- Reference applicable guidelines

**SCORE: [0-100]** (numerical score only)`;

      const startTime = Date.now();

      const result = await generateText({
        model: openai(model),
        prompt,
        temperature,
      });

      const endTime = Date.now();

      // Calculate approximate cost
      const inputTokens = Math.ceil(prompt.length / 4); // Rough estimate: 4 chars per token
      const outputTokens = Math.ceil((result.text?.length || 0) / 4);

      let inputCost = 0;
      let outputCost = 0;

      // Cost calculation based on model
      if (model === "gpt-4o-mini") {
        inputCost = (inputTokens / 1000000) * 0.15;
        outputCost = (outputTokens / 1000000) * 0.6;
      } else if (model === "gpt-4o") {
        inputCost = (inputTokens / 1000000) * 2.5;
        outputCost = (outputTokens / 1000000) * 10;
      }

      const totalCost = inputCost + outputCost;

      // Parse JSON response
      let reviewResult: ReviewResult;
      try {
        // Try to extract JSON from the response
        const jsonMatch = result.text?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          reviewResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in response");
        }
      } catch (parseError) {
        reviewLogger.warn(
          "Failed to parse JSON response, using fallback format",
          {
            parseError:
              parseError instanceof Error
                ? parseError.message
                : "Unknown error",
          }
        );

        // Fallback to original format
        const scoreMatch = result.text?.match(/\*\*SCORE:\s*(\d+)\*\*/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;

        reviewResult = {
          summary: "Code review completed",
          score,
          generalComments: result.text || "No review generated.",
          inlineComments: [],
        };
      }

      const score = reviewResult.score;

      const response: AIReviewResponse = {
        review: reviewResult,
        cost: totalCost,
        score,
      };

      reviewLogger.info("AI code review completed successfully", {
        responseLength: result.text?.length || 0,
        inputTokens,
        outputTokens,
        costUSD: totalCost.toFixed(6),
        score,
        inlineCommentsCount: reviewResult.inlineComments.length,
        processingTimeMs: endTime - startTime,
        model,
      });

      return response;
    } catch (error) {
      reviewLogger.error("Failed to generate AI code review", {
        diffLength: diff.length,
        guidelinesLength: guidelines.length,
        model,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `AI review failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// === TOOL 4: Pull Request Posting ===
const postGitHubReviewTool = createTool({
  name: "post_github_review",
  description: "Post comprehensive review results to GitHub pull request",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    pullNumber: z.number().describe("Pull request number"),
    review: z
      .object({
        summary: z.string(),
        score: z.number(),
        generalComments: z.string(),
        inlineComments: z.array(
          z.object({
            path: z.string(),
            line: z.number(),
            severity: z.string(),
            type: z.string(),
            quote: z.string(),
            issue: z.string(),
            recommendation: z.string(),
          })
        ),
      })
      .describe("Review results to post"),
    cost: z.number().describe("AI generation cost in USD"),
    model: z.string().optional().describe("AI model used for review"),
  }),
  execute: async (input) => {
    const {
      owner,
      repo,
      pullNumber,
      review,
      cost,
      model = "gpt-4o-mini",
    } = input;

    reviewLogger.info("Executing post_github_review tool", {
      owner,
      repo,
      pullNumber,
      score: review.score,
      inlineCommentsCount: review.inlineComments.length,
      cost,
      model,
    });

    try {
      // Format the general review comment
      const generalReview = `## 🤖 AI Code Review

**Summary:** ${review.summary}

**General Comments:**
${review.generalComments}

---

**📊 Review Analytics:**
- **Quality Score:** ${review.score}/100
- **Issues Found:** ${review.inlineComments.length}
- **AI Cost:** $${cost.toFixed(6)} USD
- **Model:** ${model}
- **Generated:** ${new Date().toISOString()}

${
  review.inlineComments.length > 0
    ? `\n**📍 Inline Comments:** ${review.inlineComments.length} specific issues posted as inline comments`
    : ""
}`;

      // Post general review comment
      await githubService.postPullRequestComment(
        owner,
        repo,
        pullNumber,
        generalReview
      );

      reviewLogger.info("Posted general review comment to GitHub", {
        owner,
        repo,
        pullNumber,
      });

      // Post inline comments if any
      let inlineCommentsPosted = 0;
      if (review.inlineComments.length > 0) {
        const inlineComments = review.inlineComments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          body: `**${comment.severity.toUpperCase()} - ${comment.type.toUpperCase()}**

> \`${comment.quote}\`

**Issue:** ${comment.issue}

**Recommendation:** ${comment.recommendation}`,
        }));

        await githubService.postInlineReviewComments(
          owner,
          repo,
          pullNumber,
          inlineComments
        );

        inlineCommentsPosted = inlineComments.length;

        reviewLogger.info("Posted inline comments to GitHub", {
          owner,
          repo,
          pullNumber,
          inlineCommentsCount: inlineCommentsPosted,
        });
      }

      const result = {
        owner,
        repo,
        pullNumber,
        generalCommentPosted: true,
        inlineCommentsPosted,
        totalComments: inlineCommentsPosted + 1,
        reviewUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
      };

      reviewLogger.info("GitHub review posting completed successfully", result);

      return result;
    } catch (error) {
      reviewLogger.error("Failed to post review to GitHub", {
        owner,
        repo,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Failed to post GitHub review: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// === TOOL 5: Review Orchestration ===
const comprehensiveReviewTool = createTool({
  name: "comprehensive_review",
  description:
    "Orchestrate complete code review workflow from git diff to posting results",
  parameters: z.object({
    repoOwner: z.string().describe("Repository owner (for GitHub posting)"),
    repoName: z.string().describe("Repository name (for GitHub posting)"),
    pullNumber: z.number().describe("Pull request number (for GitHub posting)"),
    baseBranch: z
      .string()
      .optional()
      .describe("Base branch to compare against (defaults to origin/main)"),
    language: z
      .string()
      .optional()
      .describe("Primary programming language for guidelines"),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe("Specific review focus areas"),
    aiModel: z
      .string()
      .optional()
      .describe("AI model to use (defaults to gpt-4o-mini)"),
    postToGitHub: z
      .boolean()
      .optional()
      .describe("Whether to post results to GitHub (defaults to true)"),
  }),
  execute: async (input) => {
    const {
      repoOwner,
      repoName,
      pullNumber,
      baseBranch = "origin/main",
      language,
      focusAreas = [],
      aiModel = "gpt-4o-mini",
      postToGitHub = true,
    } = input;

    reviewLogger.info("Executing comprehensive_review orchestration", {
      repoOwner,
      repoName,
      pullNumber,
      baseBranch,
      language,
      focusAreas,
      aiModel,
      postToGitHub,
    });

    try {
      const startTime = Date.now();

      // Step 1: Get git diff
      reviewLogger.info("Step 1: Fetching git diff");
      const diffResult = await gitDiffTool.execute({
        baseBranch,
        fetchLatest: true,
      });

      if (!diffResult.hasChanges) {
        reviewLogger.info("No changes found, skipping review");
        return {
          success: true,
          message: "No changes found to review",
          hasChanges: false,
        };
      }

      reviewLogger.info("Changes detected, proceeding with review", {
        linesChanged: diffResult.linesChanged,
        diffLength: diffResult.diff.length,
      });

      // Step 2: Analyze commits (optional)
      reviewLogger.info("Step 2: Analyzing commit history");
      const commitAnalysis = await commitAnalysisTool.execute({ baseBranch });

      // Step 3: Load guidelines
      reviewLogger.info("Step 3: Loading coding guidelines");
      const guidelinesResult = await loadGuidelinesTool.execute({
        language,
        includeFallback: true,
      });

      // Step 4: Perform AI review
      reviewLogger.info("Step 4: Performing AI code review");
      const aiReviewResult = await aiCodeReviewTool.execute({
        diff: diffResult.diff,
        guidelines: guidelinesResult.guidelines,
        model: aiModel,
        focusAreas,
      });

      reviewLogger.info("AI review completed", {
        qualityScore: aiReviewResult.score,
        aiCostUSD: aiReviewResult.cost.toFixed(6),
        inlineCommentsCount: aiReviewResult.review.inlineComments.length,
      });

      // Step 5: Post to GitHub (if enabled)
      let githubResult = null;
      if (postToGitHub) {
        reviewLogger.info("Step 5: Posting review to GitHub");
        githubResult = await postGitHubReviewTool.execute({
          owner: repoOwner,
          repo: repoName,
          pullNumber,
          review: aiReviewResult.review,
          cost: aiReviewResult.cost,
          model: aiModel,
        });

        reviewLogger.info("Review posted to GitHub successfully", {
          reviewUrl: githubResult.reviewUrl,
          totalComments: githubResult.totalComments,
        });
      }

      const endTime = Date.now();

      const result = {
        success: true,
        hasChanges: true,
        processingTimeMs: endTime - startTime,
        git: {
          baseBranch,
          linesChanged: diffResult.linesChanged,
          diffLength: diffResult.diff.length,
        },
        commits: {
          count: commitAnalysis.commitsCount,
          authors: commitAnalysis.summary.authors,
          hasBreakingChanges: commitAnalysis.summary.hasBreakingChanges,
        },
        guidelines: {
          source: guidelinesResult.source,
          count: guidelinesResult.guidelinesCount,
          language: guidelinesResult.language,
        },
        aiReview: {
          model: aiModel,
          score: aiReviewResult.score,
          cost: aiReviewResult.cost,
          summary: aiReviewResult.review.summary,
          issuesFound: aiReviewResult.review.inlineComments.length,
          focusAreas,
        },
        github: githubResult,
      };

      reviewLogger.info("Comprehensive review completed successfully", {
        processingTimeMs: result.processingTimeMs,
        qualityScore: result.aiReview.score,
        issuesFound: result.aiReview.issuesFound,
        posted: postToGitHub,
      });

      return result;
    } catch (error) {
      reviewLogger.error("Comprehensive review failed", {
        repoOwner,
        repoName,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new Error(
        `Comprehensive review failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// === VOLT AGENT SETUP ===
const logger = createPinoLogger({
  name: "review-agent-system",
  level: configuration.logging.level as any,
});

reviewLogger.info("Initializing Review Agent VoltAgent system", {
  agentName: "comprehensive-code-reviewer",
  toolsCount: 6,
  tools: [
    "get_git_diff",
    "analyze_commits",
    "load_guidelines",
    "ai_code_review",
    "post_github_review",
    "comprehensive_review",
  ],
});

new VoltAgent({
  agents: {
    "review-agent": new Agent({
      name: "comprehensive-code-reviewer",
      description: `A comprehensive AI-powered code review agent that:
    
    1. **Git Operations**: Fetches diffs, analyzes commits, and extracts change metadata
    2. **Guidelines Integration**: Loads and applies coding guidelines from multiple sources
    3. **AI Review**: Performs intelligent code analysis using OpenAI GPT models
    4. **PR Integration**: Posts detailed reviews to GitHub pull requests
    5. **Orchestration**: Coordinates the complete review workflow
    
    The agent can handle individual tool operations or run comprehensive reviews that combine all capabilities.
    
    Key Features:
    - Multi-branch git diff analysis with commit history context
    - Dynamic guideline loading with fallback mechanisms
    - Configurable AI models and focus areas
    - Structured inline comments with severity classification
    - Cost tracking and performance metrics
    - GitHub integration with rich formatting
    
    Use 'comprehensive_review' for full workflow or individual tools for specific operations.`,
      llm: new VercelAIProvider(),
      model: openai("gpt-4o"),
      tools: [
        gitDiffTool,
        commitAnalysisTool,
        loadGuidelinesTool,
        aiCodeReviewTool,
        postGitHubReviewTool,
        comprehensiveReviewTool,
      ],
    }),
  },
  logger,
});

reviewLogger.info("Review Agent VoltAgent system started successfully");

export {
  gitDiffTool,
  commitAnalysisTool,
  loadGuidelinesTool,
  aiCodeReviewTool,
  postGitHubReviewTool,
  comprehensiveReviewTool,
  type ReviewResult,
  type InlineComment,
  type AIReviewResponse,
  type GitDiffResult,
};
