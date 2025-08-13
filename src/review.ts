// review.ts - AI-powered code review service
import { execSync } from "child_process";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { GitHubService } from "./github-service";
import { GuidelinesScanner } from "./guidelines-scanner";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// === CONFIG ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_REPO = process.env.GITHUB_REPO!;
const PR_NUMBER = process.env.PR_NUMBER!;
const GUIDELINES_PATH = path.join(__dirname, "guidelines");

// Initialize services
const logger = createPinoLogger({
  name: "code-review-service",
  level: configuration.logging.level as any,
});

const githubService = new GitHubService();
const guidelinesScanner = new GuidelinesScanner();

// === 1. Get diff from git ===
function getDiff(): string {
  logger.info("Fetching git diff from main branch");
  return execSync("git fetch origin main && git diff origin/main", {
    encoding: "utf8",
  });
}

// === 2. Load guidelines ===
async function getGuidelines(): Promise<string> {
  logger.info("Loading coding guidelines");
  try {
    // Try to use GuidelinesScanner if available
    const allGuidelines = await guidelinesScanner.scanAllGuidelines();
    return guidelinesScanner.formatGuidelinesForPrompt(allGuidelines);
  } catch (error) {
    logger.warn(
      "Failed to load guidelines from scanner, falling back to file",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      }
    );

    // Fallback to reading guidelines file
    if (fs.existsSync(GUIDELINES_PATH)) {
      return fs.readFileSync(GUIDELINES_PATH, "utf8");
    }

    return "# Default Guidelines\n\n- Follow clean code principles\n- Use meaningful variable names\n- Add proper error handling\n- Include unit tests for new features";
  }
}

// === 3. Ask AI to review code ===
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

async function reviewCode(
  diff: string,
  guidelines: string
): Promise<{ review: ReviewResult; cost: number; score: number }> {
  logger.info("Starting AI code review", {
    diffLength: diff.length,
    guidelinesLength: guidelines.length,
  });

  const prompt = `You are a senior code reviewer with expertise in software engineering best practices.
Review the following git diff against these coding guidelines.

## Guidelines:

------------------------------------------------------------

${guidelines}

------------------------------------------------------------

## Code Diff:

------------------------------------------------------------

${diff}

------------------------------------------------------------

## For each issue you find, quote the specific problematic line(s) and provide actionable feedback.

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

**SCORE: [0-100]** (numerical score only)`;

  try {
    const startTime = Date.now();

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
      temperature: 0.1,
    });

    const endTime = Date.now();

    // Calculate approximate cost for GPT-4o-mini
    // Input: $0.150 per 1M tokens, Output: $0.600 per 1M tokens
    const inputTokens = Math.ceil(prompt.length / 4); // Rough estimate: 4 chars per token
    const outputTokens = Math.ceil((result.text?.length || 0) / 4);
    const inputCost = (inputTokens / 1000000) * 0.15;
    const outputCost = (outputTokens / 1000000) * 0.6;
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
      logger.warn("Failed to parse JSON response, using fallback format", {
        parseError:
          parseError instanceof Error ? parseError.message : "Unknown error",
      });

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

    logger.info("AI code review completed successfully", {
      responseLength: result.text?.length || 0,
      inputTokens,
      outputTokens,
      costUSD: totalCost.toFixed(6),
      score,
      inlineCommentsCount: reviewResult.inlineComments.length,
      processingTimeMs: endTime - startTime,
    });

    return {
      review: reviewResult,
      cost: totalCost,
      score,
    };
  } catch (error) {
    logger.error("Failed to generate AI code review", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error(
      `AI review failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// === 4. Post review to GitHub/GitLab ===
async function postReviewToGithub(
  review: ReviewResult,
  cost: number,
  score: number
) {
  logger.info("Posting review to GitHub PR", { prNumber: PR_NUMBER });

  try {
    const [owner, repo] = GITHUB_REPO.split("/");

    // Format the general review comment
    const generalReview = `## 🤖 AI Code Review

**Summary:** ${review.summary}

**General Comments:**
${review.generalComments}

---

**📊 Review Analytics:**
- **Quality Score:** ${score}/100
- **Issues Found:** ${review.inlineComments.length}
- **AI Cost:** $${cost.toFixed(6)} USD
- **Model:** GPT-4o-mini
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
      parseInt(PR_NUMBER),
      generalReview
    );

    // Post inline comments if any
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
        parseInt(PR_NUMBER),
        inlineComments
      );

      logger.info(
        `✅ Posted ${review.inlineComments.length} inline comments to GitHub PR #${PR_NUMBER}`
      );
    }

    logger.info(`✅ Review posted to GitHub PR #${PR_NUMBER}`);
  } catch (error) {
    logger.error("Failed to post review to GitHub", {
      prNumber: PR_NUMBER,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// === 5. Main ===
(async () => {
  logger.info("Starting code review process");

  try {
    const diff = getDiff();
    if (!diff.trim()) {
      logger.info("No changes found. Skipping review.");
      process.exit(0);
    }

    logger.info("Changes detected, proceeding with review", {
      diffLength: diff.length,
      linesChanged: diff.split("\n").length,
    });

    const guidelines = await getGuidelines();
    const { review, cost, score } = await reviewCode(diff, guidelines);

    logger.info("Review analysis completed", {
      qualityScore: score,
      aiCostUSD: cost.toFixed(6),
      reviewSummary: review.summary,
      inlineCommentsCount: review.inlineComments.length,
    });

    // Post to both platforms if configured
    const promises = [];

    if (GITHUB_REPO && PR_NUMBER) {
      promises.push(postReviewToGithub(review, cost, score));
    }

    if (promises.length === 0) {
      logger.warn(
        "No PR/MR configuration found. Review generated but not posted."
      );
      logger.info("\n=== Generated Review ===");
      logger.info(`Summary: ${review.summary}`);
      logger.info(`General Comments: ${review.generalComments}`);
      logger.info(`Inline Comments: ${review.inlineComments.length}`);
      review.inlineComments.forEach((comment, index) => {
        logger.info(
          `  ${index + 1}. ${comment.path}:${comment.line} - ${comment.issue}`
        );
      });
      logger.info("\n=== Review Analytics ===");
      logger.info(`Quality Score: ${score}/100`);
      logger.info(`AI Cost: $${cost.toFixed(6)} USD`);
      logger.info(`Model: GPT-4o-mini`);
      logger.info("\n=== End Review ===");
      process.exit(0);
    }

    await Promise.all(promises);
    logger.info("Code review process completed successfully");
    process.exit(0);
  } catch (err) {
    logger.error("Code review process failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    process.exit(1);
  }
})();
