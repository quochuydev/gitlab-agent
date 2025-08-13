import { Octokit } from "@octokit/rest";
import { createPinoLogger } from "@voltagent/logger";
import { configuration } from "./configulation";

// Create logger for GitHub service
const logger = createPinoLogger({
  name: "github-service",
  level: configuration.logging.level as any,
});

export interface GitHubConfig {
  token: string;
  baseUrl?: string;
}

export interface RepositoryFile {
  path: string;
  content: string;
  encoding: string;
  size: number;
  sha: string;
}

export interface PullRequestDetails {
  id: number;
  title: string;
  description: string;
  author: {
    name: string;
    email?: string;
  };
  sourceBranch: string;
  targetBranch: string;
  status: string;
  changedFiles?: RepositoryFile[];
}

export class GitHubService {
  public octokit: Octokit;

  constructor(config?: GitHubConfig) {
    const githubToken = config?.token || configuration.github.token;
    const baseUrl = config?.baseUrl || configuration.github.baseUrl;

    logger.debug("Initializing GitHub service", {
      baseUrl,
      tokenProvided: !!githubToken,
      configProvided: !!config,
    });

    if (!githubToken) {
      logger.error("GitHub token is required");
      throw new Error(
        "GitHub token is required. Set PERSONAL_GITHUB_TOKEN environment variable or provide in config."
      );
    }

    this.octokit = new Octokit({
      auth: githubToken,
      baseUrl,
    });

    logger.info("GitHub service initialized successfully", { baseUrl });
  }

  /**
   * Fetch a specific file from a GitHub repository
   */
  async getRepositoryFile(
    owner: string,
    repo: string,
    filePath: string,
    ref: string = "main"
  ): Promise<RepositoryFile> {
    logger.debug("Fetching repository file", { owner, repo, filePath, ref });

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref,
      });

      // Handle single file response
      if (
        "content" in response.data &&
        typeof response.data.content === "string"
      ) {
        logger.debug("Repository file fetched successfully", {
          owner,
          repo,
          filePath,
          ref,
          size: response.data.size,
          encoding: response.data.encoding,
        });

        return {
          path: filePath,
          content: Buffer.from(response.data.content, "base64").toString(
            "utf-8"
          ),
          encoding: response.data.encoding,
          size: response.data.size,
          sha: response.data.sha,
        };
      } else {
        throw new Error("File not found or is a directory");
      }
    } catch (error) {
      logger.error("Failed to fetch repository file", {
        owner,
        repo,
        filePath,
        ref,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to fetch file ${filePath}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get all files from a repository tree
   */
  async getRepositoryTree(
    owner: string,
    repo: string,
    ref: string = "main",
    path: string = ""
  ): Promise<Array<{ path: string; type: string }>> {
    logger.debug("Fetching repository tree", { owner, repo, ref, path });

    try {
      const response = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: ref,
        recursive: "true",
      });

      logger.debug("Repository tree fetched successfully", {
        owner,
        repo,
        ref,
        path,
        itemCount: response.data.tree.length,
      });

      return response.data.tree
        .filter((item) => item.type === "blob") // Only files, not directories
        .map((item) => ({
          path: item.path || "",
          type: item.type || "blob",
        }));
    } catch (error) {
      logger.error("Failed to fetch repository tree", {
        owner,
        repo,
        ref,
        path,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to fetch repository tree: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get pull request details including changed files
   */
  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestDetails> {
    logger.debug("Fetching pull request", { owner, repo, pullNumber });

    try {
      const [pullRequest, files] = await Promise.all([
        this.octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        }),
        this.octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
        }),
      ]);

      logger.debug("Pull request data fetched", {
        owner,
        repo,
        pullNumber,
        title: pullRequest.data.title,
        sourceBranch: pullRequest.data.head.ref,
        targetBranch: pullRequest.data.base.ref,
        changesCount: files.data.length,
      });

      const changedFiles: RepositoryFile[] = [];

      // Fetch content for each changed file (excluding deletions)
      for (const file of files.data) {
        if (file.status !== "removed") {
          try {
            logger.debug("Fetching changed file content", {
              owner,
              repo,
              pullNumber,
              filePath: file.filename,
            });

            const fileContent = await this.getRepositoryFile(
              owner,
              repo,
              file.filename,
              pullRequest.data.head.sha
            );
            changedFiles.push(fileContent);
          } catch (error) {
            logger.warn("Could not fetch content for changed file", {
              owner,
              repo,
              pullNumber,
              filePath: file.filename,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      }

      logger.info("Pull request fetched successfully", {
        owner,
        repo,
        pullNumber,
        changedFilesCount: changedFiles.length,
      });

      return {
        id: pullRequest.data.number,
        title: pullRequest.data.title,
        description: pullRequest.data.body || "",
        author: {
          name: pullRequest.data.user?.login || "Unknown",
          email: pullRequest.data.user?.email || undefined,
        },
        sourceBranch: pullRequest.data.head.ref,
        targetBranch: pullRequest.data.base.ref,
        status: pullRequest.data.state,
        changedFiles,
      };
    } catch (error) {
      logger.error("Failed to fetch pull request", {
        owner,
        repo,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to fetch pull request ${pullNumber}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string) {
    logger.debug("Fetching repository info", { owner, repo });

    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      logger.debug("Repository info fetched successfully", {
        owner,
        repo,
        fullName: response.data.full_name,
        defaultBranch: response.data.default_branch,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to fetch repository info", {
        owner,
        repo,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to fetch repository ${owner}/${repo}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * List pull requests for a repository
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options: {
      state?: "open" | "closed" | "all";
      base?: string;
      head?: string;
    } = {}
  ) {
    logger.debug("Listing pull requests", { owner, repo, options });

    try {
      const response = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: options.state || "open",
        base: options.base,
        head: options.head,
      });

      logger.debug("Pull requests listed successfully", {
        owner,
        repo,
        count: response.data.length,
        state: options.state || "open",
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to list pull requests", {
        owner,
        repo,
        options,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to list pull requests: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Post a review comment to a pull request
   */
  async postPullRequestComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string
  ) {
    logger.debug("Posting pull request comment", { owner, repo, pullNumber });

    try {
      const response = await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        body,
        event: "COMMENT",
      });

      logger.info("Pull request comment posted successfully", {
        owner,
        repo,
        pullNumber,
        reviewId: response.data.id,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to post pull request comment", {
        owner,
        repo,
        pullNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to post pull request comment: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
