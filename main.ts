import { minimatch } from "minimatch";
import parseDiff from "parse-diff";
import { configuration } from "./configuration";
import { logger } from "./utils/logger";
import { analyzeCode } from "./agents/analyzer";
import { postGitLabComment } from "./utils/comments";
import { toAppError } from "./utils/errors";

async function main() {
  if (!process.env.GIT_DIFF) {
    throw new Error(
      "GIT_DIFF environment variable is required but not set. Please ensure GIT_DIFF contains the git diff output to analyze."
    );
  }

  const parsedDiff = parseDiff(process.env.GIT_DIFF);

  const excludePatterns = configuration.exclude
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    );
  });

  const comments = await analyzeCode(
    filteredDiff,
    configuration.gitlab?.mergeRequestId
  );

  if (comments.length === 0) {
    logger.info("No suggestions from AI.");
    return;
  }

  for (const c of comments) {
    logger.debug({ c }, "Generated comment");
    await postGitLabComment(c);
  }

  logger.info("Done.");
}

main().catch((err: unknown) => {
  const error = toAppError(err);
  logger.error({ err: error }, "Unhandled error");
  process.exit(1);
});
