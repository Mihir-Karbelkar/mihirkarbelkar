import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChunks,
  buildManifest,
  chunkText,
  plainMarkdown,
  siteDocs,
} from '../src/lib/corpus.ts';
import { hybridSearch, keywordScores } from '../src/lib/retrieval.ts';
import { projects } from '../src/data/portfolio.ts';

test('chunkText packs sentences with overlap and keeps all text', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence ${i} ends.`).join(
    ' ',
  );
  const chunks = chunkText(text, 120, 40);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 140));
  for (let i = 0; i < 30; i++)
    assert.ok(chunks.some((c) => c.includes(`Sentence ${i} ends.`)));
  // overlap: the last sentence of a chunk is repeated in the next one
  const last = chunks[0].split(/(?<=\.) /).at(-1)!;
  assert.ok(chunks[1].includes(last));
});
test('plainMarkdown strips syntax', () => {
  const t = plainMarkdown(
    "import X from 'y'\n# Title\n\nSome [link](http://a) and **bold**.\n\n```js\ncode()\n```\n![img](a.png)",
  );
  assert.ok(!/[#*`\[\]]/.test(t) && !t.includes('code()'));
  assert.ok(t.includes('link') && t.includes('bold'));
});
test('every project is in the corpus and the manifest version tracks content', () => {
  const docs = siteDocs();
  const chunks = buildChunks(docs);
  for (const p of projects) assert.ok(chunks.some((c) => c.doc === p.slug));
  const a = buildManifest(docs),
    b = buildManifest([
      ...docs,
      { id: 'x', title: 'X', href: '/x', kind: 'blog', text: 'New post.' },
    ]);
  assert.equal(a.version, buildManifest(siteDocs()).version);
  assert.notEqual(a.version, b.version);
});
test('keyword-only hybrid search keeps the existing behaviour', () => {
  const chunks = buildChunks(siteDocs());
  assert.equal(hybridSearch('robot fleet scale', chunks)[0].id, 'robot-fleet');
  assert.deepEqual(hybridSearch('the and of', chunks), []);
  assert.equal(
    keywordScores('', chunks).every((s) => s === 0),
    true,
  );
});
test('vector ranking contributes and results are grouped per document', () => {
  const chunks = buildChunks(siteDocs());
  const target = chunks.findIndex((c) => c.doc === 'qwen-fine-tuning');
  const unit = (i: number) => {
    const v = new Float32Array(4);
    v[i] = 1;
    return v;
  };
  const vectors = chunks.map((_, i) => (i === target ? unit(0) : unit(1)));
  const results = hybridSearch('zzz unrelated words', chunks, {
    queryVector: unit(0),
    vectors,
  });
  assert.equal(results[0].id, 'qwen-fine-tuning');
  assert.equal(new Set(results.map((r) => r.id)).size, results.length);
});
