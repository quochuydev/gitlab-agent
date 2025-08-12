# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Run the agent in development mode using tsx
- `npm run typecheck` - Type check the TypeScript code without emitting files

## Architecture

This is a VoltAgent-based AI agent system built with TypeScript and Node.js. The architecture consists of:

### Core Components

- **Agent System**: Built on VoltAgent framework with Anthropic Claude integration
- **Tools**: Zod-schema based tool definitions for structured agent interactions
- **Logging**: Pino-based structured logging via `@voltagent/logger`
- **AI Provider**: Vercel AI SDK integration for Claude model access

### Project Structure

- `src/main.ts` - Entry point that initializes the VoltAgent system
- The agent is configured with:
  - Anthropic Claude (opus-4-1 model) via VercelAIProvider
  - Custom tools defined with Zod schemas
  - Structured logging with configurable levels

### Key Dependencies

- `@voltagent/core` - Main agent framework
- `@ai-sdk/anthropic` - Anthropic model integration
- `@voltagent/vercel-ai` - Vercel AI provider
- `zod` - Schema validation for tool parameters
- `tsx` - TypeScript execution for development

The system uses ES modules and targets Node.js 20 with ES2020 compatibility.