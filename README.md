# AI Code Review Agent

A VoltAgent-based AI agent system that automatically reviews code and provides feedback via Slack.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- GitHub token with repository access
- OpenAI API key
- Slack webhook URL

### Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd gitlab-agent
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens and URLs
   ```

3. **Required Environment Variables**
   ```env
   GITHUB_TOKEN=your_github_token_here
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
   OPENAI_API_KEY=your_openai_api_key_here
   ```

### Usage

#### Start the AI Code Review Agent
```bash
npm run agent
```

The agent will:
- Monitor code changes using `git diff origin/main`
- Review code against guidelines in `/guidelines/`
- Send feedback to Slack with actionable recommendations
- Provide "Update now" buttons for automated fixes

#### Manual Code Review
```bash
# Run one-time review
npm run review

# Run with specific branch
git diff origin/develop | npm run review
```

## 📁 Project Structure

```
├── src/
│   ├── v2.ts              # Main agent entry point
│   ├── configuration.ts   # Environment configuration
│   └── utils.ts          # Utility functions
├── guidelines/
│   ├── general.md        # General review rules
│   ├── ts/patterns.md    # TypeScript guidelines
│   └── examples/         # Response format examples
└── .env                  # Environment variables
```

## 🔧 Configuration

### Guidelines
Edit files in `/guidelines/` to customize review criteria:
- `guidelines/general.md` - Main review rules
- `guidelines/ts/patterns.md` - TypeScript-specific patterns
- `guidelines/examples/` - Response format examples

### Slack Integration
The agent sends structured messages to Slack with:
- Code issues found
- Recommended fixes
- Action buttons for automated updates

Example Slack message format:
```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn", 
        "text": "*AI Code Review Result*\n\n*Original code:*\n```typescript\nconst badCode = () => { console.log('test') }\n```\n\n*Recommendation:*\n```typescript\nconst goodCode = (): void => {\n  console.log('Test');\n};\n```"
      }
    }
  ]
}
```

## 🚀 Team Workflow

### For Developers

1. **Push commits to your branch**
2. **Agent automatically reviews changes**
3. **Receive Slack notifications with feedback**
4. **Click "Update now" to apply fixes**
5. **Review and commit the changes**

### For Team Leads

1. **Configure guidelines in `/guidelines/`**
2. **Set up Slack webhook for your channel**
3. **Deploy agent on your CI/CD pipeline**
4. **Monitor code quality improvements**

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Development mode
npm run agent        # Start AI review agent
npm run review       # One-time review
npm run webhook      # Start webhook server
npm run build        # Build TypeScript
npm run volt         # Volt CLI
```

### Adding Custom Guidelines

1. Create new files in `/guidelines/`
2. Update `/guidelines/general.md` to reference them
3. Restart the agent to load new guidelines

### Testing

```bash
# Test the agent
npm run agent

# Make a code change
echo "const test = () => { console.log('test') }" > test.ts
git add test.ts
git commit -m "test commit"

# Check Slack for review feedback
```

## 🔒 Security

- Never commit `.env` file
- Use environment-specific tokens
- Rotate tokens regularly
- Review Slack webhook permissions

## 📞 Support

- Check logs with `LOG_LEVEL=debug`
- Verify environment variables are set
- Ensure GitHub/Slack tokens have proper permissions
- Review guidelines format matches examples

## 🎯 Features

- ✅ Automatic code review on git changes
- ✅ TypeScript pattern validation
- ✅ Slack integration with action buttons
- ✅ Customizable review guidelines
- ✅ OpenAI-powered analysis
- ✅ One-click code fixes