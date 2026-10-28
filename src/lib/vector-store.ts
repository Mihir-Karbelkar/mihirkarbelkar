import type { SearchManifest } from './corpus';
import type { Source } from './prompt';
import { hybridSearch } from './retrieval';
import { routeByExample, type ActionId, type Exemplars } from './router';
import type { EmbedRequest, EmbedResponse } from '../workers/embed.worker';
export type Progress = (text: string, progress: number) => void;
const CACHE = 'portfolio-search';
let manifest: Promise<SearchManifest> | null = null,
  vectors: Promise<Float32Array[]> | null = null,
  worker: Worker | null = null,
  modelReady = false,
  seq = 0;
/** The first call includes downloading MiniLM (~23 MB); later calls are fast. */
const FIRST_CALL_MS = 45000,
  CALL_MS = 8000;
interface Pending {
  texts: number;
  resolve: (v: Float32Array[]) => void;
  reject: (e: Error) => void;
  progress?: Progress;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<number, Pending>();
export function loadManifest(): Promise<SearchManifest> {
  manifest ??= fetch('/search-index.json').then((r) => {
    if (!r.ok) throw new Error('The search index is unavailable.');
    return r.json() as Promise<SearchManifest>;
  });
  manifest.catch(() => (manifest = null));
  return manifest;
}
/** A crashed or unloadable worker rejects everything in flight; the next call starts a fresh one. */
function failAll(reason: string) {
  worker?.terminate();
  worker = null;
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pending.delete(id);
  }
}
function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../workers/embed.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.addEventListener('message', ({ data: m }: MessageEvent<EmbedResponse>) => {
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') return p.progress?.(m.text, m.progress);
    clearTimeout(p.timer);
    pending.delete(m.id);
    if (m.type === 'error') return p.reject(new Error(m.text));
    modelReady = true;
    const out: Float32Array[] = [];
    for (let i = 0; i < p.texts; i++)
      out.push(m.data.subarray(i * m.dims, (i + 1) * m.dims));
    p.resolve(out);
  });
  w.addEventListener('error', (e) => {
    e.preventDefault();
    failAll('The search model stopped working.');
  });
  w.addEventListener('messageerror', () =>
    failAll('The search model sent an unreadable reply.'),
  );
  worker = w;
  return w;
}
function embed(texts: string[], progress?: Progress): Promise<Float32Array[]> {
  const w = getWorker(),
    id = ++seq;
  return new Promise((resolve, reject) => {
    // Batches of chunks get proportionally longer than a single query.
    const ms =
      (modelReady ? CALL_MS : FIRST_CALL_MS) +
      Math.ceil(texts.length / 8) * 2000;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The search model took too long.'));
    }, ms);
    pending.set(id, { texts: texts.length, resolve, reject, progress, timer });
    w.postMessage({ id, texts } satisfies EmbedRequest);
  });
}
async function cached(key: string): Promise<Float32Array | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(key);
    return hit ? new Float32Array(await hit.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
async function store(key: string, data: Float32Array) {
  try {
    const cache = await caches.open(CACHE);
    for (const old of await cache.keys()) await cache.delete(old);
    await cache.put(key, new Response(data.slice().buffer));
  } catch {}
}
/** Chunk vectors for the current manifest: from the Cache API, or embedded once in the browser. */
export function ensureVectors(progress?: Progress): Promise<Float32Array[]> {
  vectors ??= (async () => {
    const m = await loadManifest(),
      key = `/search-vectors/${m.version}`,
      dims = 384,
      hit = await cached(key);
    if (hit && hit.length === m.chunks.length * dims)
      return m.chunks.map((_, i) => hit.subarray(i * dims, (i + 1) * dims));
    const out = await embed(
      m.chunks.map((c) => `${c.title}. ${c.text}`),
      progress,
    );
    const flat = new Float32Array(out.length * dims);
    out.forEach((v, i) => flat.set(v, i * dims));
    await store(key, flat);
    return out;
  })();
  vectors.catch(() => (vectors = null));
  return vectors;
}
const queryCache = new Map<string, Promise<Float32Array>>();
/** One embedding per distinct query, shared by the router and search. */
function embedQuery(query: string): Promise<Float32Array> {
  let v = queryCache.get(query);
  if (!v) {
    v = embed([query]).then(([x]) => x);
    v.catch(() => queryCache.delete(query));
    queryCache.set(query, v);
  }
  return v;
}
let exemplarVectors: {
  key: string;
  vectors: Promise<Float32Array[]>;
  ready: boolean;
} | null = null;
function ensureExemplars(exemplars: Exemplars) {
  const key = exemplars.texts.join('\n');
  if (exemplarVectors?.key !== key) {
    const entry = {
      key,
      vectors: embed(exemplars.texts),
      ready: false,
    };
    entry.vectors.then(
      () => (entry.ready = true),
      () => exemplarVectors === entry && (exemplarVectors = null),
    );
    exemplarVectors = entry;
  }
  return exemplarVectors.vectors;
}
let indexReady = false;
/** True once the router examples are embedded, so routing costs one query embedding. */
export const routerWarm = () => modelReady && !!exemplarVectors?.ready;
/**
 * Loads the search model and embeds the site index and router examples in
 * the background (on first focus), so the first question isn't kept waiting.
 */
export function warmUp(exemplars: Exemplars, progress?: Progress) {
  return Promise.all([
    ensureVectors(progress).then(() => (indexReady = true)),
    ensureExemplars(exemplars),
  ]).catch(() => {});
}
/** The site-action match for the Auto router; null when unsure or unavailable. */
export async function routeAction(
  query: string,
  exemplars: Exemplars,
): Promise<ActionId | null> {
  try {
    const [queryVector, vectors] = await Promise.all([
      embedQuery(query),
      ensureExemplars(exemplars),
    ]);
    return routeByExample(query, queryVector, exemplars, vectors);
  } catch {
    return null;
  }
}
/** Instant keyword-only search over the prebuilt index. */
export async function keywordSearch(
  query: string,
  limit = 4,
): Promise<Source[]> {
  return hybridSearch(query, (await loadManifest()).chunks, { limit });
}
/**
 * Hybrid vector + keyword search. Until the index is embedded (or if the
 * model can't load) it answers from keywords instead of waiting.
 */
export async function search(query: string, limit = 4): Promise<Source[]> {
  const m = await loadManifest();
  if (!indexReady) return hybridSearch(query, m.chunks, { limit });
  try {
    const [chunkVectors, queryVector] = await Promise.all([
      ensureVectors(),
      embedQuery(query),
    ]);
    return hybridSearch(query, m.chunks, {
      queryVector,
      vectors: chunkVectors,
      limit,
    });
  } catch {
    return hybridSearch(query, m.chunks, { limit });
  }
}
export async function clearSearchCache() {
  vectors = null;
  indexReady = false;
  failAll('Search cache cleared.');
  try {
    await caches.delete(CACHE);
  } catch {}
}
