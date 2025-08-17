export interface Configuration {
  github: {
    token: string;
    repo: string;
    prNumber: string;
  };
  slack: {
    webhookUrl: string;
  };
  openai: {
    apiKey: string;
  };
  server: {
    port: number;
  };
  review: {
    currentBranch: string;
  };
}

export const configuration: Configuration = {
  github: {
    token: process.env.GITHUB_TOKEN || "",
    repo: process.env.GITHUB_REPO || "",
    prNumber: process.env.PR_NUMBER || "",
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || "",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  server: {
    port: parseInt(process.env.PORT || "3000"),
  },
  review: {
    currentBranch: process.env.CURRENT_BRANCH || "HEAD",
  },
};

// Helper function to update configuration for webhook events
export const updateConfigurationFromWebhook = (
  repo: string,
  branch: string
): void => {
  configuration.github.repo = repo;
  configuration.review.currentBranch = branch;
};
