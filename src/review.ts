// review.ts - AI-powered code review service
import { execSync } from "child_process";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { GitHubService } from "./github-service";
import { GuidelinesScanner } from "./guidelines-scanner";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";
import * as fs from "fs";
import * as path from "path";

// === CONFIG ===
const GITHUB_REPO = process.env.GITHUB_REPO!; // format: owner/repo
const PR_NUMBER = process.env.PR_NUMBER!; // e.g. "42"
const GUIDELINES_PATH = path.join(__dirname, "guidelines.md");

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
async function reviewCode(diff: string, guidelines: string): Promise<string> {
  logger.info("Starting AI code review", {
    diffLength: diff.length,
    guidelinesLength: guidelines.length,
  });

  const prompt = `
You are a senior code reviewer with expertise in software engineering best practices.
Review the following git diff against these coding guidelines.

Guidelines:
${guidelines}

Code Diff:
${diff}

Provide a comprehensive markdown-formatted review with:
- **Summary**: Brief overview of the changes
- **Issues Found**: List any bugs, security vulnerabilities, or problems
- **Suggested Improvements**: Recommendations for better code quality
- **Style & Best Practices**: Any violations of coding standards
- **Security Concerns**: Potential security issues if any
- **Performance**: Any performance-related observations

Format your response in clear markdown with appropriate headers and bullet points.
  `;

  try {
    const result = await generateText({
      model: anthropic("claude-3-5-sonnet-20241022"),
      prompt,
      temperature: 0.1,
    });

    logger.info("AI code review completed successfully", {
      responseLength: result.text.length,
    });

    return result.text || "No review generated.";
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
async function postReviewToGithub(reviewBody: string) {
  logger.info("Posting review to GitHub PR", { prNumber: PR_NUMBER });

  try {
    const [owner, repo] = GITHUB_REPO.split("/");

    // Use our GitHub service to post the review
    await githubService.postPullRequestComment(
      owner,
      repo,
      parseInt(PR_NUMBER),
      reviewBody
    );

    logger.info(`✅ Review posted to GitHub PR #${PR_NUMBER}`);
    console.log(`✅ Review posted to GitHub PR #${PR_NUMBER}`);
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
      console.log("No changes found. Skipping review.");
      return;
    }

    logger.info("Changes detected, proceeding with review", {
      diffLength: diff.length,
      linesChanged: diff.split("\n").length,
    });

    const guidelines = await getGuidelines();
    const review = await reviewCode(diff, guidelines);

    // Post to both platforms if configured
    const promises = [];

    if (GITHUB_REPO && PR_NUMBER) {
      promises.push(postReviewToGithub(review));
    }

    if (promises.length === 0) {
      logger.warn(
        "No PR/MR configuration found. Review generated but not posted."
      );
      console.log("\n=== Generated Review ===");
      console.log(review);
      console.log("\n=== End Review ===");
      return;
    }

    await Promise.all(promises);
    logger.info("Code review process completed successfully");
  } catch (err) {
    logger.error("Code review process failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
