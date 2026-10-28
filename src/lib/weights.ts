/**
 * Downloads WebLLM weight shards with byte-level progress.
 *
 * WebLLM's own Cache API path uses `cache.add()`, which reports nothing until
 * a whole ~30 MB shard lands (four in parallel), so a phone can sit at 0% for
 * minutes and a real stall looks identical. We stream the shards ourselves and
 * store them under the exact keys WebLLM uses (scope "webllm/model"), so its
 * loader finds everything cached and goes straight to loading onto the GPU.
 */
export const WEBLLM_CACHE = 'webllm/model';
export interface ShardRecord {
  dataPath: string;
  nbytes: number;
}
type CacheLike = Pick<Cache, 'match' | 'put'>;
type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>;
export interface DownloadOptions {
  /** The record's `model` URL from WebLLM's app config. */
  model: string;
  cache: CacheLike;
  fetch?: FetchLike;
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  concurrency?: number;
  /** No bytes for this long counts as a stall (ms). */
  stallMs?: number;
  /** Runs once the missing byte count is known, before downloading (e.g. checkStorage). */
  beforeDownload?: (missingBytes: number) => Promise<void>;
}
/** Mirrors WebLLM's cleanModelUrl: ".../MODEL" -> ".../MODEL/resolve/main/". */
export function modelBaseUrl(model: string): string {
  let url = model.endsWith('/') ? model : `${model}/`;
  if (!/.+\/resolve\/.+\//.test(url)) url += 'resolve/main/';
  return new URL(url).href;
}
export class DownloadError extends Error {
  name = 'DownloadError';
}
const abortError = () => new DOMException('Download cancelled.', 'AbortError');
async function readShard(
  url: string,
  fetcher: FetchLike,
  signal: AbortSignal | undefined,
  stallMs: number,
  onBytes: (n: number) => void,
): Promise<Blob> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  let stalled = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };
  let received = 0;
  try {
    arm();
    const res = await fetcher(url, { signal: controller.signal });
    if (!res.ok)
      throw new DownloadError(
        `The model host answered ${res.status} for ${url.split('/').pop()}.`,
      );
    if (!res.body) {
      const blob = await res.blob();
      onBytes(blob.size);
      return blob;
    }
    const reader = res.body.getReader(),
      parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parts.push(value);
      received += value.byteLength;
      onBytes(value.byteLength);
    }
    return new Blob(parts as BlobPart[]);
  } catch (e) {
    onBytes(-received); // this attempt's bytes no longer count
    if (signal?.aborted) throw abortError();
    if (stalled) throw new DownloadError('stalled');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
/** Ensures every weight shard of a model is in the cache. Returns total bytes. */
export async function downloadWeights({
  model,
  cache,
  fetch: fetcher = (u, i) => fetch(u, i),
  onProgress,
  signal,
  concurrency = 4,
  stallMs = 30000,
  beforeDownload,
}: DownloadOptions): Promise<number> {
  const base = modelBaseUrl(model);
  const manifest = await fetcher(new URL('tensor-cache.json', base).href, {
    signal,
  });
  if (!manifest.ok)
    throw new DownloadError(
      `The model host answered ${manifest.status} for the weight list.`,
    );
  const records = ((await manifest.json()) as { records: ShardRecord[] })
    .records;
  const total = records.reduce((n, r) => n + r.nbytes, 0);
  let loaded = 0,
    last = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (force || now - last > 250) {
      last = now;
      onProgress?.(Math.min(loaded, total), total);
    }
  };
  const pending: string[] = [];
  for (const r of records) {
    const url = new URL(r.dataPath, base).href;
    if (await cache.match(new Request(url))) loaded += r.nbytes;
    else pending.push(url);
  }
  report(true);
  if (pending.length) await beforeDownload?.(total - loaded);
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      if (signal?.aborted) throw abortError();
      const url = pending[next++];
      let blob: Blob | undefined;
      for (let attempt = 0; !blob; attempt++) {
        try {
          blob = await readShard(url, fetcher, signal, stallMs, (n) => {
            loaded += n;
            report();
          });
        } catch (e) {
          if (e instanceof DownloadError && e.message === 'stalled') {
            if (attempt < 1) continue;
            throw new DownloadError(
              'The download stalled. Check your connection and try again.',
            );
          }
          throw e;
        }
      }
      await cache.put(
        url,
        new Response(blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
      report(true);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  );
  report(true);
  return total;
}
/** Throws a readable error when the browser can't hold the model. */
export async function checkStorage(bytes: number) {
  const storage = (globalThis.navigator as Navigator | undefined)?.storage;
  if (!storage?.estimate) return;
  try {
    await storage.persist?.();
  } catch {}
  const { quota = Infinity, usage = 0 } = await storage.estimate();
  if (quota - usage < bytes * 1.05)
    throw new DownloadError(
      `Not enough browser storage for this model (it needs about ${Math.ceil(bytes / 1e6)} MB free).`,
    );
}
