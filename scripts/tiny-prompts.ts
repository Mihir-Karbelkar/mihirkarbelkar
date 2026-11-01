/**
 * Builds the prompts the chat sends Tiny 30M for tests/tiny-site-eval.json,
 * with the browser's index, embeddings and hybrid search, as JSONL for
 * tiny-paraphraser/site_eval.py (which scores a checkpoint on them).
 *
 *   node --experimental-strip-types scripts/tiny-prompts.ts ../tiny-paraphraser/site_eval/prompts.jsonl
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';
import { buildManifest, siteDocs } from '../src/lib/corpus.ts';
import { hybridSearch } from '../src/lib/retrieval.ts';
import { EMBED_MODEL } from '../src/lib/text.ts';
import { tinySources } from '../src/lib/tiny.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: tiny-prompts.ts OUT.jsonl');
const { chunks } = buildManifest(siteDocs());
const extract = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' });
const embed = async (texts: string[]) => {
  const t = await extract(texts, { pooling: 'mean', normalize: true });
  const d = t.dims[1];
  return texts.map((_, i) => (t.data as Float32Array).subarray(i * d, (i + 1) * d));
};
const vectors = await embed(chunks.map((c) => `${c.title}. ${c.text}`));
const { questions } = JSON.parse(readFileSync('tests/tiny-site-eval.json', 'utf8'));
const lines: string[] = [];
for (const { q, expect, chat } of questions as { q: string; expect?: string[]; chat?: boolean }[]) {
  const [queryVector] = await embed([q]);
  const sources = hybridSearch(q, chunks, { queryVector, vectors, limit: 4 });
  // the sources too, so the scorer can try other passage rules
  lines.push(JSON.stringify({ question: q, prompt: tinySources(sources), sources, expect: expect ?? null, chat: !!chat }));
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} prompts to ${out}.`);
