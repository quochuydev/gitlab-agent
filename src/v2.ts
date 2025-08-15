import { openai } from "@ai-sdk/openai";
import { Agent, MCPConfiguration, VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { execSync } from "child_process";
import { configuration } from "./configuration";
import { getFileContent } from "./utils";
import { sendSlackNotification, createReviewMessage } from "./slack";

const mcpConfig = new MCPConfiguration({
  servers: {
    github: {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
      requestInit: {
        headers: {
          Authorization: `Bearer ${configuration.github.token}`,
        },
      },
    },
  },
});

const systemPrompt = getFileContent("./guidelines/general.md");

const agent = new Agent({
  name: "Code Review Agent",
  description: systemPrompt,
  llm: new VercelAIProvider(),
  model: openai("gpt-4o-mini"),
  tools: await mcpConfig.getTools(),
});

// Create logger
const logger = createPinoLogger({
  name: "code-review-agent",
  level: "info",
});

// Function to get git diff
const getGitDiff = (): string => {
  try {
    return execSync("git diff origin/main", { encoding: "utf8" });
  } catch (error) {
    logger.error("Failed to get git diff: " + (error instanceof Error ? error.message : String(error)));
    return "";
  }
};

// Function to review code and send to Slack
const performCodeReview = async (): Promise<void> => {
  const diff = getGitDiff();
  
  if (!diff.trim()) {
    logger.info("No changes detected, skipping review");
    return;
  }

  logger.info("Starting code review...");
  
  // Here you would integrate with your AI review logic
  // For now, sending a sample notification
  const sampleMessage = createReviewMessage(
    'const update_date = new Date();',
    'const updateDate = new Date();',
    'Variable naming should use camelCase according to TypeScript guidelines',
    'https://your-ci-pipeline-link-or-github-action'
  );

  await sendSlackNotification(sampleMessage);
  logger.info("Code review completed and notification sent");
};

// Initialize VoltAgent
new VoltAgent({
  agents: {
    agent,
  },
  logger,
});

// Start code review process
performCodeReview().catch((error) => {
  logger.error("Code review failed: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
