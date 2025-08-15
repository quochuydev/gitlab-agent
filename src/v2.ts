import { openai } from "@ai-sdk/openai";
import { Agent, MCPConfiguration, VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import { configuration } from "./configulation";
import { getFileContent } from "./utils";

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
console.log(`debug:systemPrompt`, systemPrompt);

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

new VoltAgent({
  agents: {
    agent,
  },
  logger,
});
