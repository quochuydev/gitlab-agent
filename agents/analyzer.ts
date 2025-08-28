import { File } from 'parse-diff';
import { createPrompt } from './prompts';
import { getAIResponse } from './ai';
import { createComment } from '../utils/comments';

export async function analyzeCode(
  parsedDiff: File[],
  sessionId?: string,
): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === '/dev/null') continue;

    for (const chunk of file.chunks) {
      const prompt = createPrompt(chunk);
      const aiResponse = await getAIResponse(prompt, sessionId);

      if (aiResponse) {
        const newComments = createComment(file, aiResponse);
        if (newComments) comments.push(...newComments);
      }
    }
  }

  return comments;
}
