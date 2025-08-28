import { Chunk, File } from 'parse-diff';
import { logger } from './logger';
import { toAppError } from '../types/errors';

export function createComment(
  file: File,
  chunk: Chunk,
  aiResponses: Array<{ lineNumber: string; reviewComment: string }>,
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
  try {
    const gitlab = {
      apiV4Url: process.env.CI_API_V4_URL!,
      projectId: process.env.CI_PROJECT_ID!,
      mergeRequestId: process.env.CI_MERGE_REQUEST_IID!,
      gitlabToken: process.env.GITLAB_TOKEN!,
      baseSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA!,
      headSha: process.env.CI_COMMIT_SHA!,
      startSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA!,
    };
    if (!gitlab.gitlabToken) throw new Error('Invalid gitlab token');

    const url = `${gitlab.apiV4Url}/projects/${gitlab.projectId}/merge_requests/${gitlab.mergeRequestId}/discussions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': gitlab.gitlabToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: c.body,
        position: {
          position_type: 'text',
          base_sha: gitlab.baseSha,
          head_sha: gitlab.headSha,
          start_sha: gitlab.startSha,
          new_path: c.path,
          new_line: c.line,
        },
      }),
    });

    const result = await response.json();
    logger.debug({ result }, 'GitLab API response');
  } catch (err: unknown) {
    const error = toAppError(err);
    logger.error({ err: error }, 'Error posting GitLab comment');
  }
}
