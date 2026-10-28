import type { SearchManifest } from './corpus';
import type { Source } from './content';
import { hybridSearch } from './retrieval';
import type { EmbedRequest, EmbedResponse } from '../workers/embed.worker';
export type Progress = (text: string, progress: number) => void;
const CACHE = 'portfolio-search';
let manifest: Promise<SearchManifest> | null = null,
  vectors: Promise<Float32Array[]> | null = null,
  worker: Worker | null = null,
  seq = 0;
export function loadManifest(): Promise<SearchManifest> {
  manifest ??= fetch('/search-index.json').then((r) => {
    if (!r.ok) throw new Error('The search index is unavailable.');
    return r.json() as Promise<SearchManifest>;
  });
  manifest.catch(() => (manifest = null));
  return manifest;
}
function embed(texts: string[], progress?: Progress): Promise<Float32Array[]> {
  worker ??= new Worker(new URL('../workers/embed.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++seq,
    w = worker;
  return new Promise((resolve, reject) => {
    const listener = ({ data: m }: MessageEvent<EmbedResponse>) => {
      if (m.id !== id) return;
      if (m.type === 'progress') return progress?.(m.text, m.progress);
      w.removeEventListener('message', listener);
      if (m.type === 'error') return reject(new Error(m.text));
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++)
        out.push(m.data.subarray(i * m.dims, (i + 1) * m.dims));
      resolve(out);
    };
    w.addEventListener('message', listener);
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
export type SearchResult = { sources: Source[]; semantic: boolean };
/** Hybrid search; degrades to keyword-only if the embedding model can't load. */
export async function search(
  query: string,
  progress?: Progress,
): Promise<SearchResult> {
  const m = await loadManifest();
  try {
    const [chunkVectors, [queryVector]] = await Promise.all([
      ensureVectors(progress),
      embed([query]),
    ]);
    return {
      sources: hybridSearch(query, m.chunks, {
        queryVector,
        vectors: chunkVectors,
      }),
      semantic: true,
    };
  } catch {
    return { sources: hybridSearch(query, m.chunks), semantic: false };
  }
}
export async function clearSearchCache() {
  vectors = null;
  worker?.terminate();
  worker = null;
  try {
    await caches.delete(CACHE);
  } catch {}
}
