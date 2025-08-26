import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as z from 'zod';

export interface Configuration {
  openai: {
    apiKey: string;
    model: string;
  };
  exclude: string;
}

if (process.env.DOT_ENV_PATH) {
  const envPath = path.join(process.cwd(), process.env.DOT_ENV_PATH);
  const buffer = fs.readFileSync(envPath);
  const defaultConfig = dotenv.parse(buffer);

  Object.entries(defaultConfig).forEach(([key, value]) => {
    if (!process.env[key]) process.env[key] = value;
  });
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
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_API_MODEL || 'gpt-4',
  },
  exclude: process.env.EXCLUDE || '**/*.json, **/*.md',
};

try {
  console.log(`debug:configuration`, configuration);
  schema.parse(configuration);
} catch (error) {
  console.error('Bad configuration.', error);
  throw error;
}

export { configuration };
