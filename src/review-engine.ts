import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createPinoLogger } from "@voltagent/logger";
import { execSync } from "child_process";
import { configuration } from "./configuration";
import { getFileContent } from "./utils";
import { sendSlackNotification, createReviewMessage } from "./slack";

// Create logger
const logger = createPinoLogger({
  name: "review-engine",
  level: "info",
});

// Load guidelines
const systemPrompt = getFileContent("./guidelines/general.md");
const tsGuidelines = getFileContent("./guidelines/ts/patterns.md");

// Function to get git diff
const getGitDiff = (): string => {
  try {
    const currentBranch = configuration.review.currentBranch;
    const command = `git diff origin/main...${currentBranch}`;
    return execSync(command, { encoding: "utf8" });
  } catch (error) {
    logger.error(
      "Failed to get git diff: " +
        (error instanceof Error ? error.message : String(error))
    );
    return "";
  }
};

// Function to analyze code with AI
const analyzeCodeWithAI = async (diff: string): Promise<any[]> => {
  const prompt = `${systemPrompt}

TypeScript Guidelines:
${tsGuidelines}

Code Changes:
${diff}

Review the code changes and provide feedback. Focus on:
- Variable naming (camelCase)
- Missing return types
- TypeScript best practices
- Code quality issues

Return ONLY a JSON array of findings in this format:
[
  {
    "originalCode": "exact code snippet with issue",
    "recommendation": "corrected code",
    "explanation": "brief explanation of why change is needed"
  }
]

If no issues found, return: []`;

  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
      temperature: 0.1,
    });

    logger.info("AI analysis completed");
    return JSON.parse(result.text.trim());
  } catch (error) {
    logger.error(
      "AI analysis failed: " +
        (error instanceof Error ? error.message : String(error))
    );
    return [];
  }
};

// Generate action URL for "Update now" button
const getActionUrl = (): string => {
  const repo = configuration.github.repo;
  const prNumber = configuration.github.prNumber;

  if (repo && prNumber) {
    return `https://github.com/${repo}/pull/${prNumber}`;
  }

  // Fallback to repository root
  return repo ? `https://github.com/${repo}` : "#";
};

// Main review function
export const performCodeReview = async (): Promise<void> => {
  const diff = getGitDiff();

  if (!diff.trim()) {
    logger.info("No changes detected, skipping review");
    return;
  }

  logger.info("Starting AI code review...");

  const findings: any[] = await analyzeCodeWithAI(diff);

  if (findings.length === 0) {
    logger.info("No issues found in code review");
    return;
  }

  logger.info(`Found ${findings.length} code review findings`);

  const actionUrl = getActionUrl();

  // Send each finding as a separate Slack message
  for (const finding of findings) {
    const message = createReviewMessage(
      finding.originalCode,
      finding.recommendation,
      finding.explanation,
      actionUrl
    );

    await sendSlackNotification(message);
  }

  logger.info("Code review completed and notifications sent");
};
