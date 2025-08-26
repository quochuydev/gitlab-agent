import fs from "fs";
import { minimatch } from "minimatch";
import OpenAI from "openai";
import parseDiff, { Chunk, File } from "parse-diff";
import path from "path";
import { configuration } from "./configuration";

console.log(`Has env SLACK_WEBHOOK_URL`, !!process.env.SLACK_WEBHOOK_URL);
console.log(`Has env OPENAI_API_KEY`, !!process.env.OPENAI_API_KEY);
console.log(`Has env GIT_DIFF`, !!process.env.GIT_DIFF);

if (!process.env.GIT_DIFF) throw new Error("GIT_DIFF is not set");

const openai = new OpenAI({ apiKey: configuration.openai.apiKey });

async function main() {
  const fullDiff = process.env.GIT_DIFF || ""; // git diff origin/main

  const parsedDiff = parseDiff(fullDiff);

  const excludePatterns = configuration.exclude
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    );
  });

  const comments = await analyzeCode(filteredDiff);

  if (comments.length === 0) {
    console.log("No suggestions from AI.");
    return;
  }

  for (const c of comments) {
    try {
      console.log(`debug:c`, JSON.stringify(c));

      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: `File: ${c.path}, Line: ${c.line}, Comment: ${c.body}`,
          }),
        });
      }

      if (process.env.GITLAB_TOKEN) {
        await postGitLabComment(c);
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    }
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

async function analyzeCode(
  parsedDiff: File[]
): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // deleted

    for (const chunk of file.chunks) {
      const prompt = createPrompt(chunk);
      const aiResponse = await getAIResponse(prompt);

      if (aiResponse) {
        const newComments = createComment(file, chunk, aiResponse);
        if (newComments) comments.push(...newComments);
      }
    }
  }

  return comments;
}

function loadGuidelines(): string {
  const guidelinesDir = path.resolve(__dirname, "./guidelines");

  const files = fs
    .readdirSync(guidelinesDir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
    .sort();

  const contents = files.map((file) =>
    fs.readFileSync(path.join(guidelinesDir, file), "utf8")
  );

  return contents.join("\n\n---\n\n");
}

const guidelines = loadGuidelines();

function createPrompt(chunk: Chunk): string {
  return `
${guidelines}

---

Git diff to review:

\`\`\`diff
${chunk.content}

${chunk.changes
  // @ts-expect-error - ln and ln2 exist in parse-diff chunks
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}

async function getAIResponse(prompt: string): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  try {
    const response: OpenAI.Chat.Completions.ChatCompletion =
      await openai.chat.completions.create({
        model: configuration.openai.model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: prompt,
          },
        ],
      });

    const res = response.choices[0].message?.content?.trim() || "{}";
    return JSON.parse(res).reviews;
  } catch (error: any) {
    console.error("Error from OpenAI:", error?.message || error);
    return null;
  }
}

function createComment(
  file: File,
  chunk: Chunk,
  aiResponses: Array<{ lineNumber: string; reviewComment: string }>
): Array<{ body: string; path: string; line: number }> {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) return [];

    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    };
  });
}

async function postGitLabComment(c: {
  body: string;
  path: string;
  line: number;
}) {
  try {
    const url = `${process.env.CI_API_V4_URL}/projects/${process.env.CI_PROJECT_ID}/merge_requests/${process.env.CI_MERGE_REQUEST_IID}/discussions`;

    const payload = {
      body: c.body,
      position: {
        position_type: "text",
        base_sha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
        head_sha: process.env.CI_COMMIT_SHA,
        start_sha: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
        new_path: c.path,
        new_line: c.line,
      },
    };

    await fetch(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": process.env.GITLAB_TOKEN!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    console.error("Error from GitLab:", error?.message || error);
  }
}
