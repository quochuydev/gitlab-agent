import { Chunk } from "parse-diff";
import { loadGuidelines } from "./guidelines";

const guidelines = loadGuidelines();

export function createPrompt(chunk: Chunk): string {
  return `Your task is to review merge requests. 

## Instructions:

- Provide the response in following JSON format: {"reviews": [{"lineNumber": <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in Markdown format.
- Use the given description only for the overall context and only comment the code.
- IMPORTANT: NEVER suggest adding comments to the code.

## Guidelines:

${guidelines}

##Git diff to review:

\`\`\`diff
${chunk.content}

${chunk.changes
  // @ts-expect-error - ln and ln2 exist in parse-diff chunks
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}
