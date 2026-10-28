import { stopWords, terms } from './text.ts';
import type { Source } from './prompt.ts';
import type { Chunk } from './corpus.ts';
/** Cosine similarity below this is treated as unrelated (MiniLM, normalized vectors). */
export const MIN_SIMILARITY = 0.3;
const RRF_K = 60;
export function keywordScores(query: string, chunks: Chunk[]): number[] {
  const expanded = query
    .replace(/help|build|offer/gi, 'services')
    .replace(/robot[s]?/gi, 'robot')
    .replace(/agent[s]?/gi, 'agent');
  const q = [...new Set(terms(expanded).filter((t) => !stopWords.has(t)))];
  if (!q.length) return chunks.map(() => 0);
  return chunks.map((c) => {
    const doc = terms(c.doc),
      title = terms(c.title),
      text = new Set(terms(c.text));
    return q.reduce(
      (sum, t) =>
        sum +
        (doc.includes(t) ? 5 : 0) +
        (title.includes(t) ? 5 : 0) +
        (text.has(t) ? 1 : 0),
      0,
    );
  });
}
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
const ranks = (scores: number[], min: number) =>
  scores
    .map((score, i) => ({ score, i }))
    .filter((s) => s.score > min)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.i);
export interface HybridOptions {
  queryVector?: ArrayLike<number>;
  vectors?: ArrayLike<number>[];
  limit?: number;
}
/**
 * Reciprocal-rank fusion of keyword and vector rankings over chunks, grouped
 * back into one Source per document (its two best chunks).
 */
export function hybridSearch(
  query: string,
  chunks: Chunk[],
  { queryVector, vectors, limit = 3 }: HybridOptions = {},
): Source[] {
  const fused = new Map<number, number>();
  const add = (order: number[]) =>
    order.forEach((i, rank) =>
      fused.set(i, (fused.get(i) || 0) + 1 / (RRF_K + rank)),
    );
  add(ranks(keywordScores(query, chunks), 0));
  if (queryVector && vectors?.length === chunks.length)
    add(
      ranks(
        vectors.map((v) => dot(queryVector, v)),
        MIN_SIMILARITY,
      ),
    );
  const byDoc = new Map<string, { score: number; chunks: Chunk[] }>();
  [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([i, score]) => {
      const c = chunks[i],
        entry = byDoc.get(c.doc);
      if (!entry) byDoc.set(c.doc, { score, chunks: [c] });
      else if (entry.chunks.length < 2) entry.chunks.push(c);
    });
  return [...byDoc.values()]
    .slice(0, limit)
    .map(({ chunks: [first, ...rest] }) => ({
      id: first.doc,
      title: first.title,
      href: first.href,
      text: [first, ...rest].map((c) => c.text).join(' … '),
    }));
}
