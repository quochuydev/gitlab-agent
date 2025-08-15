export interface Configuration {
  github: {
    token: string;
  };
  slack: {
    webhookUrl: string;
  };
  openai: {
    apiKey: string;
  };
}

export const configuration: Configuration = {
  github: {
    token: process.env.GITHUB_TOKEN || "",
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || "",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
};