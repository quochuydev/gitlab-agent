import { Chunk } from 'parse-diff';
import { loadGuidelines } from './guidelines';

const guidelines = loadGuidelines();

export function createPrompt(chunk: Chunk): string {
  return `
${guidelines}

---

Git diff to review:

\`\`\`diff
${chunk.content}

${chunk.changes
  // @ts-expect-error - ln and ln2 exist in parse-diff chunks
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join('\n')}
\`\`\`
`;
}
