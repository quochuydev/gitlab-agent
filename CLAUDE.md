# Introduction

- This is a VoltAgent-based AI agent system built with TypeScript and Node.js

### Key Dependencies

- `@voltagent/core` - Main agent framework
- `openai` - OpenAI model integration
- `@voltagent/vercel-ai` - Vercel AI provider
- `zod` - Schema validation for tool parameters
- `tsx` - TypeScript execution for development

# Features

- User (a developer member in company) can run the agent in development mode using tsx
- When he push a new commit to github, the agent will be triggered to review the code
  - Based on the command: `git diff origin/main`
- The agent will use the guidelines to review the code and provide feedback
- The feedback will be sent to user via slack API

````sh
curl -X POST -H 'Content-type: application/json' \
--data '{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*AI Code Review Result*\n\n*Bad Code:*\n```function foo() { console.log(\"test\")}```\n\n*Recommendation:*\n```function foo() {\n  console.log(\"Test\");\n}```"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Update now"
          },
          "style": "primary",
          "url": "https://your-ci-pipeline-link-or-github-action"
        }
      ]
    }
  ]
}' \
https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
````

- If user allow the change, he will press "Update now" button in slack. API will be triggered to update the code.
