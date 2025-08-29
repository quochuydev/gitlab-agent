import { minimatch } from "minimatch";
import parseDiff from "parse-diff";
import { configuration } from "./configuration";
import { logger } from "./utils/logger";
import { analyzeCode } from "./agents/analyzer";
import { postGitLabComment } from "./utils/comments";

async function main() {
  if (!process.env.GIT_DIFF) {
    throw new Error(
      "GIT_DIFF environment variable is required but not set. Please ensure GIT_DIFF contains the git diff output to analyze."
    );
  }

  const parsedDiff = parseDiff(`diff --git a/.gitlab-ci.yml b/.gitlab-ci.yml
index f2a7e18..75d7834 100644
--- a/.gitlab-ci.yml
+++ b/.gitlab-ci.yml
@@ -10,7 +10,7 @@ variables:
   HOST: docker
   BUILD_VERSION: vCI_PIPELINE_IID
   DEPLOY_VERSION:
-      description: 'Input version for deployment'
+    description: 'Input version for deployment'
 
 before_script:
   - echo $CI_REGISTRY_PASSWORD | docker login $CI_REGISTRY --username $CI_REGISTRY_USER --password-stdin
@@ -30,6 +30,7 @@ before_script:
   - free -h
 
 stages:
+  - review
   - build
   - deploy
 
@@ -76,6 +77,34 @@ services:
     - export DOCKER_IMAGE_VERSION=$DEPLOY_VERSION
 
+review:code:
+  stage: review
+  tags: [dind]
+  cache:
+    - key: yarn-cache
+      paths:
+        - .yarn/cache
+  variables:
+    DOCKER_HOST: tcp://docker:2376
+    DOCKER_TLS_CERTDIR: '/certs'
+    DOCKER_TLS_VERIFY: 1
+    DOCKER_CERT_PATH: '$DOCKER_TLS_CERTDIR/client'
+    DOCKER_DRIVER: overlay2
+    OPENAI_API_KEY: $OPENAI_API_KEY
+    MONGODB_URL: $MONGODB_URL
+    GITLAB_TOKEN: $GITLAB_TOKEN
+  script:
+    - *setup-gitlab
+    - cd ./apps/review
+    - yarn install --frozen-lockfile
+    - git fetch origin main
+    - export GIT_DIFF="$(git diff origin/main...HEAD)"
+    - GIT_DIFF="$GIT_DIFF" yarn review
+  rules:
+    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_COMMIT_MESSAGE =~ /(\[review\])/i'
+      when: always
+    - when: never
+
 build:portal-prisma:
   stage: build
   tags: [dind]
@@ -201,7 +230,6 @@ diff:demo:portal:
       export DIFF=diff
       task deploy:app
 
-
 deploy:demo:portal:
   stage: deploy
   tags: [dind]`);

  const excludePatterns = configuration.exclude
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    );
  });

  const sessionId =
    configuration.gitlab?.mergeRequestId || `review-${Date.now()}`;

  const comments = await analyzeCode(filteredDiff, sessionId);

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

main().catch((err) => {
  logger.error({ err }, "Unhandled error");
  process.exit(1);
});
