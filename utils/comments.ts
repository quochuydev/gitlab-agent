import { File } from 'parse-diff';
import { logger } from './logger';
import { toAppError } from '../types/errors';

export function createComment(
  file: File,
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
      apiV4Url: process.env.CI_API_V4_URL ?? '',
      projectId: process.env.CI_PROJECT_ID ?? '',
      mergeRequestId: process.env.CI_MERGE_REQUEST_IID ?? '',
      gitlabToken: process.env.GITLAB_TOKEN ?? '',
      baseSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? '',
      headSha: process.env.CI_COMMIT_SHA ?? '',
      startSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? '',
    };
    
    if (!gitlab.apiV4Url) throw new Error('CI_API_V4_URL is required');
    if (!gitlab.projectId) throw new Error('CI_PROJECT_ID is required');
    if (!gitlab.mergeRequestId) throw new Error('CI_MERGE_REQUEST_IID is required');
    if (!gitlab.gitlabToken) throw new Error('GITLAB_TOKEN is required');
    if (!gitlab.baseSha) throw new Error('CI_MERGE_REQUEST_DIFF_BASE_SHA is required');
    if (!gitlab.headSha) throw new Error('CI_COMMIT_SHA is required');

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
