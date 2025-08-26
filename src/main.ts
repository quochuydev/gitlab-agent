import { openai } from "@ai-sdk/openai";
import { Agent, VoltAgent, createTool } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { z } from "zod";
import { sendSlackNotification } from "./slack";

// Create logger
const logger = createPinoLogger({
  name: "technical-agent",
  level: "info",
});

// Define a calculator tool
const slackSendMessageTool = createTool({
  name: "slack-send-message",
  description: "Send a message to Slack",
  parameters: z.object({
    message: z.string().describe("message"),
  }),
  execute: async (args) => {
    try {
      console.log(`debug:args`, args);

      const result = await sendSlackNotification({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: args.message,
            },
          },
        ],
      });
      return { result };
    } catch (e) {
      console.log(`debug:e`, e);

      const errorMessage = e instanceof Error ? e.message : String(e);

      throw new Error(
        `Failed to send message to Slack: ${args.message}. Error: ${errorMessage}`
      );
    }
  },
});

const agent = new Agent({
  name: "TechnicalAgent",
  description:
    "A helpful assistant that can review code and send messages to Slack",
  llm: new VercelAIProvider(),
  model: openai("gpt-4.1-mini"),
  tools: [slackSendMessageTool],
});

new VoltAgent({
  agents: {
    agent,
  },
  logger,
});
