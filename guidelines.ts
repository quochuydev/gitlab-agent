import fs from 'fs';
import path from 'path';

export function loadGuidelines(): string {
  const guidelinesDir = path.resolve(__dirname, './guidelines');

  const files = fs
    .readdirSync(guidelinesDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
    .sort();

  const contents = files.map((file) =>
    fs.readFileSync(path.join(guidelinesDir, file), 'utf8'),
  );

  return contents.join('\n\n---\n\n');
}
