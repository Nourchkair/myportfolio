import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, getCorpusMeta, getEntities } from '../src/knowledge/retrieval.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const queries = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/retrieval-queries.json'), 'utf8'));

test('corpus is built and structured', () => {
  const meta = getCorpusMeta();
  assert.ok(meta.chunks >= 100);
  assert.match(meta.contentHash, /^[a-f0-9]{16}$/);
  const entities = getEntities();
  assert.equal(entities.projects.length, 5);
  assert.ok(entities.chapters.length >= 6);
});

test('English project and journey queries retrieve expected chunks', () => {
  assert.ok(search('What does Safiy do?', { limit: 3 }).some((result) => result.id.startsWith('safiy:')));
  assert.ok(search('Where did Nour study?', { limit: 3 }).some((result) => result.id.startsWith('journey:education')));
  assert.ok(search('How can I contact Nour?', { limit: 3 }).some((result) => result.id === 'site:contact'));
});

test('French and paraphrase queries retrieve expected chunks', () => {
  assert.ok(search('Où habite Nour ?', { limit: 3 }).some((result) => result.id === 'profile:intro'));
  assert.ok(search('Quelle est la contribution de Nour à Safiy ?', { limit: 3 }).some((result) => result.id === 'safiy:contribution'));
  assert.ok(search('Quelles sont les étapes du parcours client ?', { limit: 3 }).some((result) => result.id.startsWith('acquisition:flow')));
});

test('published knowledge overrides are searchable alongside the corpus', () => {
  const results = search('What is the phase four synthetic fact?', {
    limit: 3,
    extraChunks: [{
      id: 'test:phase4-override',
      type: 'override',
      title: 'Phase four synthetic fact',
      text: 'The phase four synthetic fact is used to validate publishable knowledge overrides.',
      route: null,
      tags: ['synthetic'],
      keywords: []
    }]
  });
  assert.equal(results[0]?.id, 'test:phase4-override');
});

test('retrieval benchmark meets Phase 1 thresholds', () => {
  let top1 = 0;
  let top3 = 0;
  for (const item of queries) {
    const ids = search(item.q, { limit: 3 }).map((result) => result.id);
    const rank = ids.findIndex((id) => item.expected.includes(id));
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
  }
  const top1Rate = top1 / queries.length;
  const top3Rate = top3 / queries.length;
  assert.ok(top1Rate >= 0.82, `top1 ${top1Rate}`);
  assert.ok(top3Rate >= 0.92, `top3 ${top3Rate}`);
});
