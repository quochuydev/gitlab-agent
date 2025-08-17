import { createPinoLogger } from "@voltagent/logger";
import express from "express";
import { configuration, updateConfigurationFromWebhook } from "./configuration";
import { performCodeReview } from "./review-engine";

const app = express();
const port = configuration.server.port;

// Create logger
const logger = createPinoLogger({
  name: "webhook-server",
  level: "info",
});

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GitHub webhook endpoint
app.get("/webhook/github", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/webhook/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    const payload = req.body;

    logger.info(`Received GitHub webhook: ${event}`);

    // Only process push events
    if (event === "push") {
      const { repository, ref, pusher } = payload;

      logger.info(
        `Processing push event - Repo: ${repository?.full_name}, Branch: ${ref}, Pusher: ${pusher?.name}`
      );

      // Skip if push is to main branch (we compare against main)
      if (ref === "refs/heads/main") {
        logger.info("Skipping review for main branch push");
        res.json({ message: "Skipped main branch" });
        return;
      }

      // Update configuration for the review
      const repoName = repository?.full_name || "";
      const branchName = ref?.replace("refs/heads/", "") || "";
      updateConfigurationFromWebhook(repoName, branchName);

      // Trigger code review
      await performCodeReview();

      res.json({ message: "Code review triggered" });
    } else {
      logger.info(`Ignoring ${event} event`);
      res.json({ message: `Ignored ${event} event` });
    }
  } catch (error) {
    logger.error(
      "Webhook processing failed: " +
        (error instanceof Error ? error.message : String(error))
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(port, () => {
  logger.info(`Webhook server running on port ${port}`);
  logger.info("Ready to receive GitHub webhooks at /webhook/github");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});
