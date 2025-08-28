import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import * as z from "zod";
import { toAppError } from "./utils/errors";

export interface Configuration {
  exclude: string;
  openai: {
    apiKey: string;
    model: string;
  };
  gitlab?: {
    apiV4Url: string;
    projectId: string;
    mergeRequestId: string;
    gitlabToken: string;
    baseSha: string;
    headSha: string;
    startSha: string;
  };
  mongodbUrl: string;
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
  exclude: z.string(),
  openai: z.object({
    apiKey: z.string(),
    model: z.string(),
  }),
  gitlab: z
    .object({
      apiV4Url: z.string(),
      projectId: z.string(),
      mergeRequestId: z.string(),
      gitlabToken: z.string(),
      baseSha: z.string(),
      headSha: z.string(),
      startSha: z.string(),
    })
    .optional(),
  mongodbUrl: z.string(),
});

const configuration: Configuration = {
  exclude: process.env.EXCLUDE ?? "**/*.json, **/*.md",
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_API_MODEL ?? "gpt-4",
  },
  gitlab: process.env.GITLAB_TOKEN
    ? {
        apiV4Url: process.env.CI_API_V4_URL ?? "",
        projectId: process.env.CI_PROJECT_ID ?? "",
        mergeRequestId: process.env.CI_MERGE_REQUEST_IID ?? "",
        gitlabToken: process.env.GITLAB_TOKEN ?? "",
        baseSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? "",
        headSha: process.env.CI_COMMIT_SHA ?? "",
        startSha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? "",
      }
    : undefined,
  mongodbUrl: process.env.MONGODB_URL!,
};

try {
  console.log("debug:configuration", {
    exclude: configuration.exclude,
    openai: {
      apiKey: configuration.openai.apiKey ? "[REDACTED]" : "[MISSING]",
      model: configuration.openai.model,
    },
    mongodbUrl: configuration.mongodbUrl ? "[REDACTED]" : "[MISSING]",
  });
  schema.parse(configuration);
} catch (err: unknown) {
  const error = toAppError(err);
  console.error("Bad configuration.", error.message);
  throw error;
}

export { configuration };
