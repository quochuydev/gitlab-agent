# AI Code Review Agent

Automatically reviews your code when you push and sends feedback to Slack.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   GITHUB_TOKEN=your_github_token_here
   GITHUB_REPO=owner/repository-name
   PR_NUMBER=123
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   ```

3. **Start Webhook Server**
   ```bash
   npm run webhook
   ```

4. **Setup GitHub Webhook**
   - Go to your GitHub repo → Settings → Webhooks
   - Add webhook: `https://your-domain.com/webhook/github`
   - Select "Push events"
   - Set Content-Type: `application/json`

## Usage

**Automatic Mode (Recommended):**
1. Push code to any branch (not main)
2. Agent automatically reviews changes
3. Get Slack notifications with feedback

**Manual Mode:**
```bash
npm run review
```

## How it works

1. **Push Code** → GitHub sends webhook
2. **AI Reviews** → Compares branch vs main
3. **Slack Alert** → Sends issues + fixes
4. **Click "Update now"** → Go to GitHub PR