# CLAUDE.md

## Development Commands

- `npm run dev` - Run the agent in development mode using tsx
- `npm run webhook` - Run the webhook server
- `npm run review` - Run the review script

## Architecture

This is a VoltAgent-based AI agent system built with TypeScript and Node.js. The architecture consists of:

### Core Components

- **Agent System**: Built on VoltAgent framework with OpenAI integration
- **Tools**: Zod-schema based tool definitions for structured agent interactions
- **Logging**: Pino-based structured logging via `@voltagent/logger`
- **AI Provider**: Vercel AI SDK integration for OpenAI model access

### Project Structure

- `src/main.ts` - Entry point that initializes the VoltAgent system
- The agent is configured with:
  - OpenAI (gpt-4o-mini model) via VercelAIProvider
  - Custom tools defined with Zod schemas
  - Structured logging with configurable levels

### Key Dependencies

- `@voltagent/core` - Main agent framework
- `openai` - OpenAI model integration
- `@voltagent/vercel-ai` - Vercel AI provider
- `zod` - Schema validation for tool parameters
- `tsx` - TypeScript execution for development

The system uses ES modules and targets Node.js 20 with ES2020 compatibility.
