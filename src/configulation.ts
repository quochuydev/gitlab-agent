import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const configuration = {
  gitlab: {
    url: process.env.GITLAB_URL || "https://gitlab.com",
    token: process.env.GITLAB_TOKEN,
  },
  github: {
    token: process.env.PERSONAL_GITHUB_TOKEN,
    baseUrl: process.env.GITHUB_BASE_URL || "https://api.github.com",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  logging: {
    level: process.env.LOG_LEVEL || "debug", // Set default to debug for better debugging
  },
  guidelines: {
    directory: process.env.GUIDELINES_DIR || "./guidelines",
  },
  server: {
    port: parseInt(process.env.PORT || "3141"),
  },
  webhooks: {
    github: {
      secret: process.env.GITHUB_WEBHOOK_SECRET,
    },
    gitlab: {
      secret: process.env.GITLAB_WEBHOOK_SECRET,
    },
  },
};
