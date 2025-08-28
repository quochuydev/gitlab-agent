import { File } from "parse-diff";
import { logger } from "./logger";
import { toAppError } from "./errors";
import { configuration } from "../configuration";

export function createComment(
  file: File,
  aiResponses: Array<{ lineNumber: string; reviewComment: string }>
) {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) return [];
    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    };
  });
}

export async function postGitLabComment(c: {
  body: string;
  path: string;
  line: number;
}) {
  if (!configuration.gitlab) {
    logger.error("GitLab configuration is missing");
    return;
  }

  try {
    const response = await fetch(
      `${configuration.gitlab.apiV4Url}/projects/${configuration.gitlab.projectId}/merge_requests/${configuration.gitlab.mergeRequestId}/discussions`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": configuration.gitlab.gitlabToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: c.body,
          position: {
            position_type: "text",
            base_sha: configuration.gitlab.baseSha,
            head_sha: configuration.gitlab.headSha,
            start_sha: configuration.gitlab.startSha,
            new_path: c.path,
            new_line: c.line,
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: result?.message || "Unknown error",
        },
        "GitLab API error"
      );
      return;
    }

    logger.debug(
      {
        status: response.status,
        discussionId: result?.id,
        success: true,
      },
      "GitLab comment posted successfully"
    );
  } catch (err: unknown) {
    const error = toAppError(err);
    logger.error({ err: error }, "Error posting GitLab comment");
  }
}
