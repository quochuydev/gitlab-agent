import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";
import { startWebhookServer } from "./webhook-server";

// Create logger
const logger = createPinoLogger({
  name: "webhook-main",
  level: configuration.logging.level as any,
});

logger.info("Starting GitLab/GitHub Code Review Webhook Service", {
  port: configuration.server.port,
  github: {
    configured: configuration.github.token,
    webhookSecretConfigured: configuration.webhooks.github.secret,
  },
  gitlab: {
    configured: configuration.gitlab.token,
    webhookSecretConfigured: configuration.webhooks.gitlab.secret,
  },
});

// Start the webhook server
startWebhookServer();

logger.info("Webhook service initialization complete");
