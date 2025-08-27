import OpenAI from 'openai';
import { configuration } from './configuration';
import { logger } from './logger';

const openai = new OpenAI({ apiKey: configuration.openai.apiKey });

export async function getAIResponse(prompt: string): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  try {
    const response = await openai.chat.completions.create({
      model: configuration.openai.model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
      ],
    });

    const res = response.choices[0].message?.content?.trim() || '{}';
    return JSON.parse(res).reviews;
  } catch (error: any) {
    logger.error({ err: error }, 'Error from OpenAI');
    return null;
  }
}
