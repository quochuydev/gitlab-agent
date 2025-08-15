# Review Agent - VoltAgent-Based AI Code Review System

## Overview

This document outlines the complete conversion of the standalone `review.ts` script into a comprehensive VoltAgent-based AI agent system. The new `review-agent.ts` provides a modular, tool-based architecture that can handle individual operations or orchestrate complete review workflows.

## ✅ Conversion Checklist Progress

### ✅ Create tools for git operations (diff fetching, commit analysis)
- **`get_git_diff`**: Fetches git diffs from main branch or between specific commits
- **`analyze_commits`**: Analyzes commit history and extracts metadata for review context

### ✅ Add structured code review tool with AI integration
- **`ai_code_review`**: Performs comprehensive AI-powered code review using OpenAI GPT with guidelines
- Supports configurable models, temperature, and focus areas
- Includes cost tracking and structured JSON response parsing

### ✅ Integrate guidelines scanning into review agent
- **`load_guidelines`**: Loads coding guidelines from scanner or fallback files
- Supports language-specific, category-specific, or all guidelines
- Includes fallback mechanisms for robust operation

### ✅ Add pull request posting capabilities as agent tools
- **`post_github_review`**: Posts comprehensive review results to GitHub pull requests
- Formats general review comments and inline comments
- Provides review analytics and cost tracking

### ✅ Create comprehensive review orchestration agent
- **`comprehensive_review`**: Orchestrates the complete code review workflow
- Coordinates all tools in sequence from git diff to posting results
- Provides comprehensive reporting and error handling

## Architecture Overview

The new VoltAgent-based system consists of:

1. **6 specialized tools** for different aspects of code review
2. **1 comprehensive agent** that can use all tools
3. **Robust error handling and logging** throughout
4. **Type-safe interfaces** for all operations
5. **Flexible configuration options** for different use cases

## Tools Reference

### 1. Git Operations Tools

#### `get_git_diff`
Fetches git diff from main branch or between specific commits.

**Parameters:**
- `baseBranch` (optional): Base branch to compare against (defaults to `origin/main`)
- `targetBranch` (optional): Target branch to compare (defaults to current)
- `fetchLatest` (optional): Whether to fetch latest changes first (defaults to `true`)

**Returns:**
```typescript
{
  diff: string;           // The git diff content
  linesChanged: number;   // Number of lines in the diff
  hasChanges: boolean;    // Whether there are actual changes
}
```

#### `analyze_commits`
Analyzes commit history and extracts metadata for review context.

**Parameters:**
- `baseBranch` (optional): Base branch to compare against (defaults to `origin/main`)
- `maxCommits` (optional): Maximum number of commits to analyze (defaults to `10`)

**Returns:**
```typescript
{
  baseBranch: string;
  commitsCount: number;
  commits: CommitDetails[];
  summary: {
    totalCommits: number;
    authors: string[];
    hasBreakingChanges: boolean;
  };
}
```

### 2. Guidelines Integration Tool

#### `load_guidelines`
Loads coding guidelines from scanner or fallback files for AI review.

**Parameters:**
- `language` (optional): Specific programming language to load guidelines for
- `category` (optional): Specific guideline category (security, performance, etc.)
- `includeFallback` (optional): Whether to include fallback guidelines if scanner fails

**Returns:**
```typescript
{
  guidelines: string;      // Formatted guidelines content
  guidelinesCount: number; // Number of guidelines loaded
  source: string;         // Source of guidelines (scanner-*, file-fallback, etc.)
  language: string;       // Language or "all"
  category: string;       // Category or "all"
  length: number;         // Character length of guidelines
}
```

### 3. AI Review Tool

#### `ai_code_review`
Performs comprehensive AI-powered code review using OpenAI GPT with guidelines.

**Parameters:**
- `diff`: Git diff content to review
- `guidelines`: Coding guidelines to apply during review
- `model` (optional): OpenAI model to use (defaults to `gpt-4o-mini`)
- `temperature` (optional): Temperature for AI generation (defaults to `0.1`)
- `focusAreas` (optional): Specific areas to focus on (security, performance, etc.)

**Returns:**
```typescript
{
  review: {
    summary: string;
    score: number;
    generalComments: string;
    inlineComments: InlineComment[];
  };
  cost: number;  // USD cost of AI generation
  score: number; // Quality score 0-100
}
```

### 4. GitHub Integration Tool

#### `post_github_review`
Posts comprehensive review results to GitHub pull request.

**Parameters:**
- `owner`: GitHub repository owner
- `repo`: GitHub repository name
- `pullNumber`: Pull request number
- `review`: Review results to post
- `cost`: AI generation cost in USD
- `model` (optional): AI model used for review

**Returns:**
```typescript
{
  owner: string;
  repo: string;
  pullNumber: number;
  generalCommentPosted: boolean;
  inlineCommentsPosted: number;
  totalComments: number;
  reviewUrl: string;
}
```

### 5. Orchestration Tool

#### `comprehensive_review`
Orchestrates the complete code review workflow from git diff to posting results.

**Parameters:**
- `repoOwner`: Repository owner (for GitHub posting)
- `repoName`: Repository name (for GitHub posting)
- `pullNumber`: Pull request number (for GitHub posting)
- `baseBranch` (optional): Base branch to compare against (defaults to `origin/main`)
- `language` (optional): Primary programming language for guidelines
- `focusAreas` (optional): Specific review focus areas
- `aiModel` (optional): AI model to use (defaults to `gpt-4o-mini`)
- `postToGitHub` (optional): Whether to post results to GitHub (defaults to `true`)

**Returns:** Comprehensive result object with all workflow steps' results.

## Usage Examples

### Running the VoltAgent System

```bash
# Start the review agent system
npm run review-agent

# Alternative: Use the Volt CLI
npm run volt
```

### Using Individual Tools

Once the agent is running, you can interact with individual tools through the VoltAgent interface:

```typescript
// Example: Get git diff
await reviewAgent.execute("get_git_diff", {
  baseBranch: "main",
  fetchLatest: true
});

// Example: Load guidelines for TypeScript
await reviewAgent.execute("load_guidelines", {
  language: "typescript",
  includeFallback: true
});

// Example: Perform AI review
await reviewAgent.execute("ai_code_review", {
  diff: "...",
  guidelines: "...",
  model: "gpt-4o",
  focusAreas: ["security", "performance"]
});
```

### Running Complete Workflow

```typescript
// Execute comprehensive review
await reviewAgent.execute("comprehensive_review", {
  repoOwner: "myorg",
  repoName: "myrepo", 
  pullNumber: 123,
  baseBranch: "main",
  language: "typescript",
  focusAreas: ["security", "performance", "maintainability"],
  aiModel: "gpt-4o-mini",
  postToGitHub: true
});
```

## Key Improvements Over Standalone Script

### 1. Modular Architecture
- Each function is now a separate, reusable tool
- Tools can be used independently or as part of workflows
- Easy to test, debug, and extend individual components

### 2. Enhanced Error Handling
- Tool-level error handling with detailed logging
- Graceful fallbacks for missing dependencies
- Structured error responses with context

### 3. Better Observability
- Comprehensive logging at every step
- Performance metrics and timing
- Cost tracking for AI operations
- Detailed metadata collection

### 4. Flexibility and Configuration
- Configurable AI models and parameters
- Optional workflow steps (e.g., can skip GitHub posting)
- Multiple guideline loading strategies
- Customizable focus areas for reviews

### 5. Type Safety
- Strong TypeScript interfaces for all operations
- Zod schema validation for tool parameters
- Compile-time type checking for all data flows

### 6. Extensibility
- Easy to add new tools for other platforms (GitLab, Bitbucket)
- Pluggable guideline sources
- Support for additional AI providers
- Configurable output formats

## Environment Variables

The review agent uses the same environment variables as the original script:

```env
# Required for AI review
OPENAI_API_KEY=your_openai_api_key

# Required for GitHub integration
GITHUB_TOKEN=your_github_token
GITHUB_REPO=owner/repo
PR_NUMBER=123

# Optional configuration
LOG_LEVEL=info
```

## Monitoring and Analytics

The VoltAgent system provides comprehensive monitoring:

- **Performance Metrics**: Processing times for each tool
- **Cost Tracking**: Detailed AI usage and costs
- **Quality Metrics**: Review scores and issue counts
- **Success Rates**: Tool execution success/failure rates
- **Usage Patterns**: Most used tools and workflows

## Migration Path

To migrate from the standalone script to the VoltAgent system:

1. **Immediate**: Start using `npm run review-agent` instead of `npm run review`
2. **Integration**: Update CI/CD scripts to use the new agent endpoint
3. **Customization**: Leverage new configuration options for your specific needs
4. **Extension**: Add custom tools for your specific workflow requirements

## Troubleshooting

### Common Issues

1. **Git Operations Fail**
   - Ensure you're in a git repository
   - Check that `origin/main` branch exists
   - Verify git credentials and permissions

2. **Guidelines Loading Fails**
   - Check if `GuidelinesScanner` is properly initialized
   - Verify guidelines directory exists
   - Fallback guidelines will be used automatically

3. **AI Review Fails**
   - Verify `OPENAI_API_KEY` is set
   - Check API rate limits and quotas
   - Ensure diff content is not too large (GPT token limits)

4. **GitHub Posting Fails**
   - Verify `GITHUB_TOKEN` has proper permissions
   - Check repository access and PR existence
   - Ensure PR is in open state for comment posting

### Debug Mode

Enable debug logging for detailed troubleshooting:

```env
LOG_LEVEL=debug
```

This will provide detailed information about each tool's execution, parameter validation, and internal operations.

## Future Enhancements

The VoltAgent architecture makes it easy to add:

- **GitLab Integration**: Similar tools for GitLab MR commenting
- **Multiple AI Providers**: Support for Claude, Gemini, etc.
- **Custom Review Rules**: Domain-specific review criteria
- **Batch Processing**: Review multiple PRs at once
- **Review Templates**: Customizable review formats
- **Integration APIs**: REST/GraphQL endpoints for external systems
- **Review History**: Tracking and analytics over time
- **Team Configurations**: Role-based review settings

## Contributing

To add new tools or enhance existing ones:

1. Follow the existing tool pattern with Zod validation
2. Add comprehensive error handling and logging
3. Include TypeScript types for all interfaces
4. Add unit tests for tool logic
5. Update this documentation

The VoltAgent architecture makes the codebase much more maintainable and extensible for future development.
