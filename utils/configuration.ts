import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as z from 'zod';
import { toAppError } from '../types/errors';

export interface Configuration {
  openai: {
    apiKey: string;
    model: string;
  };
  exclude: string;
}

if (process.env.DOT_ENV_PATH) {
  try {
    const envPath = path.join(process.cwd(), process.env.DOT_ENV_PATH);
    const buffer = fs.readFileSync(envPath);
    const defaultConfig = dotenv.parse(buffer);

    Object.entries(defaultConfig).forEach(([key, value]) => {
      if (!process.env[key]) process.env[key] = String(value);
    });
  } catch (err: unknown) {
    const error = toAppError(err);
    console.error(error.message);
  }
}

const schema = z.object({
  openai: z.object({
    apiKey: z.string(),
    model: z.string(),
  }),
  exclude: z.string(),
});

const configuration: Configuration = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_API_MODEL ?? 'gpt-4',
  },
  exclude: process.env.EXCLUDE ?? '**/*.json, **/*.md',
};

try {
  console.log('debug:configuration', {
    openai: {
      apiKey: configuration.openai.apiKey ? '[REDACTED]' : '[MISSING]',
      model: configuration.openai.model,
    },
    exclude: configuration.exclude,
  });
  schema.parse(configuration);
} catch (err: unknown) {
  const error = toAppError(err);
  console.error('Bad configuration.', error.message);
  throw error;
}

export { configuration };
