import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, getCorpusMeta } from '../src/knowledge/retrieval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const queries = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/retrieval-queries.json'), 'utf8'));
let top1 = 0;
let top3 = 0;
let mrr = 0;
const misses = [];

for (const item of queries) {
  const results = search(item.q, { limit: 3 });
  const ids = results.map((result) => result.id);
  const rank = ids.findIndex((id) => item.expected.includes(id));
  if (rank === 0) top1++;
  if (rank >= 0 && rank < 3) top3++;
  if (rank >= 0) mrr += 1 / (rank + 1);
  if (rank < 0) misses.push({ q: item.q, expected: item.expected, got: ids });
}

const summary = {
  corpus: getCorpusMeta(),
  queries: queries.length,
  top1: Number((top1 / queries.length).toFixed(4)),
  top3: Number((top3 / queries.length).toFixed(4)),
  mrr: Number((mrr / queries.length).toFixed(4)),
  misses
};
console.log(JSON.stringify(summary, null, 2));

if (summary.top1 < 0.82 || summary.top3 < 0.92) {
  process.exitCode = 1;
}
