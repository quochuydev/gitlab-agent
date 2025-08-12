import express from "express";
import bodyParser from "body-parser";
import { createHmac, timingSafeEqual } from "crypto";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";
import { GitHubService } from "./github-service";
import { GitLabService } from "./gitlab-service";
import { GuidelinesScanner } from "./guidelines-scanner";
import { AIReviewService } from "./ai-review-service";

// Create logger for webhook server
const logger = createPinoLogger({
  name: "webhook-server",
  level: configuration.logging.level as any,
});

// Initialize services
const githubService = new GitHubService();
const gitlabService = new GitLabService();
const guidelinesScanner = new GuidelinesScanner();
const aiReviewService = new AIReviewService(githubService, guidelinesScanner);

// Helper function to verify GitHub webhook signatures
function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret || !signature) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  return (
    sigBuffer.length === expectedBuffer.length &&
    timingSafeEqual(sigBuffer, expectedBuffer)
  );
}

// Helper function to verify GitLab webhook signatures
function verifyGitLabSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  return signature === secret; // GitLab uses simple token comparison
}

// Code analysis function (simplified version from main.ts)
async function analyzeAndReviewCode(
  files: any[],
  platform: "github" | "gitlab"
) {
  logger.info("Starting automated code review", {
    filesCount: files.length,
    platform,
  });

  const results = [];

  for (const file of files) {
    if (!file.content) continue;

    try {
      // Detect language
      const ext = file.path.split(".").pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        java: "java",
        go: "go",
        rs: "rust",
      };
      const language = langMap[ext || ""] || "unknown";

      // Get guidelines
      const guidelines = await guidelinesScanner.getGuidelinesForLanguage(
        language
      );

      // Simple pattern matching analysis
      const issues: any[] = [];
      const lines = file.content.split("\n");

      lines.forEach((line: string, index: number) => {
        const lineNum = index + 1;

        // Check for console.log
        if (line.includes("console.log") && !file.path.includes("test")) {
          issues.push({
            type: "warning",
            line: lineNum,
            message: "Console.log statement should be removed for production",
            severity: "medium",
          });
        }

        // Check for hardcoded secrets
        if (line.match(/(api[_-]?key|password|secret|token)\s*[:=]\s*['"]/i)) {
          issues.push({
            type: "security",
            line: lineNum,
            message: "Potential hardcoded secret detected",
            severity: "high",
          });
        }

        // TypeScript type annotations
        if (
          (file.path.endsWith(".ts") || file.path.endsWith(".tsx")) &&
          line.match(/function\s+\w+\s*\([^)]*\)\s*\{/) &&
          !line.includes(":")
        ) {
          issues.push({
            type: "style",
            line: lineNum,
            message: "Missing return type annotation",
            severity: "medium",
          });
        }
      });

      // Calculate score
      let score = 100;
      issues.forEach((issue) => {
        switch (issue.severity) {
          case "high":
            score -= 20;
            break;
          case "medium":
            score -= 10;
            break;
          case "low":
            score -= 5;
            break;
        }
      });

      results.push({
        file: file.path,
        language,
        issues,
        score: Math.max(0, score),
        guidelinesUsed: guidelines.length,
      });
    } catch (error) {
      logger.error("Error analyzing file", {
        file: file.path,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  logger.info("Code review completed", {
    filesAnalyzed: results.length,
    platform,
    averageScore:
      results.reduce((acc, r) => acc + r.score, 0) / results.length || 0,
  });

  return results;
}

// Create Express app
const app = express();
app.use(bodyParser.raw({ type: "application/json" }));

// GitHub webhook handler
app.post("/webhook/github", async (req, res) => {
  const signature = req.headers["x-github-delivery"] as string;
  const event = req.headers["x-github-event"] as string;
  const payload = req.body.toString();
  const data = JSON.parse(payload);

  console.log(`debug:signature`, signature);
  console.log(`debug:event`, event);
  console.log(`debug:data`, data);

  logger.info("Received GitHub webhook", { event, hasSignature: !!signature });

  // Verify signature if secret is configured
  const webhookSecret = configuration.webhooks?.github?.secret;

  if (
    webhookSecret &&
    !verifyGitHubSignature(payload, signature, webhookSecret)
  ) {
    logger.warn("Invalid GitHub webhook signature");
    // return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    if (
      event === "pull_request" &&
      (data.action === "opened" || data.action === "synchronize")
    ) {
      logger.info("Processing GitHub pull request event", {
        action: data.action,
        prNumber: data.pull_request.number,
        repository: data.repository.full_name,
      });

      // Get repository details
      const [owner, repo] = data.repository.full_name.split("/");

      try {
        // Use AI Review Service for comprehensive code review
        logger.info("Starting AI-powered pull request review", {
          owner,
          repo,
          pullNumber: data.pull_request.number,
        });

        const review = await aiReviewService.reviewPullRequest(
          owner,
          repo,
          data.pull_request.number
        );

        logger.info("AI review completed", {
          owner,
          repo,
          pullNumber: data.pull_request.number,
          overallScore: review.overallScore,
          canMerge: review.canMerge,
          filesReviewed: review.fileReviews.length,
          recommendation: review.mergeDecision.recommendation,
        });

        // Post the review to GitHub
        await aiReviewService.postReviewToGitHub(
          owner,
          repo,
          data.pull_request.number,
          review
        );

        logger.info("AI review posted to GitHub successfully", {
          owner,
          repo,
          pullNumber: data.pull_request.number,
          score: review.overallScore,
          canMerge: review.canMerge,
        });
      } catch (error) {
        logger.error("Failed to complete AI review for pull request", {
          owner,
          repo,
          pullNumber: data.pull_request.number,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Post a fallback comment
        try {
          await githubService.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: data.pull_request.number,
            body: `## 🤖 AI Code Review - Error

Sorry, the AI code review service encountered an error and couldn't complete the review.

**Error**: ${error instanceof Error ? error.message : "Unknown error"}

Please review the code manually or try again later.

---
*Generated by AI Code Review Service*`,
          });
        } catch (commentError) {
          logger.error("Failed to post error comment", {
            owner,
            repo,
            pullNumber: data.pull_request.number,
            error: commentError,
          });
        }
      }
    }

    if (event === "push") {
      logger.info("Processing GitHub push event", {
        repository: data.repository.full_name,
        ref: data.ref,
        commits: data.commits?.length || 0,
        pusher: data.pusher?.name || "unknown",
      });

      // Use AI Review Service for intelligent push analysis
      if (data.commits && data.commits.length > 0) {
        const [owner, repo] = data.repository.full_name.split("/");

        try {
          logger.info("Starting AI-powered push review", {
            owner,
            repo,
            ref: data.ref,
            commitCount: data.commits.length
          });

          // Use AI Review Service to analyze commits
          const pushReview = await aiReviewService.reviewPushCommits(
            owner,
            repo,
            data.commits,
            data.after
          );

          logger.info("AI push review completed", {
            owner,
            repo,
            ref: data.ref,
            overallScore: pushReview.overallScore,
            filesAnalyzed: pushReview.fileReviews.length,
            criticalIssues: pushReview.criticalIssues
          });

          // Post review as commit comment if there are findings
          if (pushReview.fileReviews.length > 0) {
            const latestCommitSha = data.commits[data.commits.length - 1]?.id || data.after;
            
            await aiReviewService.postPushReviewToGitHub(
              owner,
              repo,
              latestCommitSha,
              pushReview,
              data.ref
            );

            logger.info("AI push review posted to GitHub successfully", {
              owner,
              repo,
              commitSha: latestCommitSha,
              score: pushReview.overallScore,
              criticalIssues: pushReview.criticalIssues
            });

            // Log critical security issues for monitoring
            if (pushReview.criticalIssues > 0) {
              logger.warn("Critical security issues detected in push - immediate attention required", {
                repository: data.repository.full_name,
                ref: data.ref,
                commitSha: latestCommitSha,
                criticalCount: pushReview.criticalIssues,
                filesAffected: pushReview.fileReviews
                  .filter(f => f.issues.some(i => i.severity === 'critical'))
                  .map(f => f.fileName)
              });
            }
          } else {
            logger.info("No code files to review in push", {
              owner,
              repo,
              ref: data.ref
            });
          }

        } catch (error) {
          logger.error("Failed to complete AI review for push", {
            owner,
            repo,
            ref: data.ref,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          // Post a simple fallback comment on the latest commit
          try {
            const latestCommitSha = data.commits[data.commits.length - 1]?.id || data.after;
            const branch = data.ref.replace('refs/heads/', '');
            
            await githubService.octokit.rest.repos.createCommitComment({
              owner,
              repo,
              commit_sha: latestCommitSha,
              body: `## 🤖 AI Code Review - Error

Sorry, the AI code review service encountered an error analyzing this push to \`${branch}\`.

**Error**: ${error instanceof Error ? error.message : 'Unknown error'}

Please review the code changes manually.

---
*Generated by AI Code Review Service*`
            });
          } catch (commentError) {
            logger.error("Failed to post error comment on push", {
              owner,
              repo,
              ref: data.ref,
              error: commentError
            });
          }
        }
      }
    }

    res.status(200).json({
      message: "Webhook processed",
    });
  } catch (error) {
    logger.error("Error processing GitHub webhook", {
      event,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// GitLab webhook handler
app.post("/webhook/gitlab", async (req, res) => {
  const token = req.headers["x-gitlab-token"] as string;
  const event = req.headers["x-gitlab-event"] as string;
  const payload = req.body.toString();

  logger.info("Received GitLab webhook", { event, hasToken: !!token });

  // Verify token if configured
  const webhookSecret = configuration.webhooks?.gitlab?.secret;
  if (webhookSecret && token !== webhookSecret) {
    logger.warn("Invalid GitLab webhook token");
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const data = JSON.parse(payload);

    if (
      event === "Merge Request Hook" &&
      data.object_attributes?.action === "open"
    ) {
      logger.info("Processing GitLab merge request opened event", {
        mrId: data.object_attributes.id,
        project: data.project.path_with_namespace,
      });

      // Fetch merge request details
      const mergeRequest = await gitlabService.getMergeRequest(
        data.project.id,
        data.object_attributes.iid
      );

      if (mergeRequest.changedFiles && mergeRequest.changedFiles.length > 0) {
        // Analyze the changed files
        const reviewResults = await analyzeAndReviewCode(
          mergeRequest.changedFiles,
          "gitlab"
        );

        logger.info("Merge request review completed", {
          project: data.project.path_with_namespace,
          mrId: data.object_attributes.iid,
          filesReviewed: reviewResults.length,
          results: reviewResults.map((r) => ({
            file: r.file,
            score: r.score,
            issuesCount: r.issues.length,
          })),
        });

        // TODO: Post review comment to GitLab MR
      }
    }

    if (event === "Push Hook") {
      logger.info("Processing GitLab push event", {
        project: data.project.path_with_namespace,
        ref: data.ref,
        commits: data.commits?.length || 0,
      });

      // TODO: Analyze commits if needed
    }

    res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    logger.error("Error processing GitLab webhook", {
      event,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      github: !!configuration.github.token,
      gitlab: !!configuration.gitlab.token,
    },
  });
});

app.get("/webhook/github", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      github: !!configuration.github.token,
    },
  });
});

app.get("/webhook/gitlab", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      gitlab: !!configuration.gitlab.token,
    },
  });
});

// Start server
const port = configuration.server?.port || 3141;

export function startWebhookServer() {
  app.listen(port, () => {
    logger.info("Webhook server started", {
      port,
      endpoints: ["/webhook/github", "/webhook/gitlab", "/health"],
    });
  });
}

export { app };
