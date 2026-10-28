import test from 'node:test';
import assert from 'node:assert/strict';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { TIERS } from '../src/lib/models.ts';
import { downloadWeights, modelBaseUrl } from '../src/lib/weights.ts';

const BASE = 'https://huggingface.co/mlc-ai/Test-MLC/resolve/main/';
function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (r: RequestInfo | URL) =>
      store.get(typeof r === 'string' ? r : ((r as Request).url ?? String(r))),
    put: async (r: RequestInfo | URL, res: Response) =>
      void store.set(typeof r === 'string' ? r : (r as Request).url, res),
  } as unknown as Cache & { store: Map<string, Response> };
}
/** Serves a manifest and shards as chunked streams; `stallOn` never finishes. */
function server(
  shards: Record<string, number>,
  opts: { stallOn?: string; status?: number } = {},
) {
  const requests: string[] = [];
  const fetcher = async (url: string, init?: { signal?: AbortSignal }) => {
    requests.push(url);
    if (url.endsWith('tensor-cache.json'))
      return Response.json({
        records: Object.entries(shards).map(([dataPath, nbytes]) => ({
          dataPath,
          nbytes,
        })),
      });
    const name = url.slice(BASE.length);
    if (opts.status) return new Response('nope', { status: opts.status });
    const size = shards[name];
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (name === opts.stallOn && sent > 0) {
          return new Promise<void>((_, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          );
        }
        const n = Math.min(1000, size - sent);
        if (n <= 0) return c.close();
        sent += n;
        c.enqueue(new Uint8Array(n));
      },
    });
    return new Response(body);
  };
  return { fetcher, requests };
}
test('modelBaseUrl matches WebLLM for every tier', () => {
  for (const t of TIERS)
    for (const id of [t.f16, t.f32]) {
      const rec = prebuiltAppConfig.model_list.find((m) => m.model_id === id)!;
      assert.equal(modelBaseUrl(rec.model), `${rec.model}/resolve/main/`);
    }
  assert.equal(modelBaseUrl(`${BASE}`), BASE);
});
test('streams shards into the cache under WebLLM keys with rising progress', async () => {
  const cache = memoryCache();
  const { fetcher } = server({
    'params_shard_0.bin': 2500,
    'params_shard_1.bin': 4000,
  });
  const seen: number[] = [];
  const total = await downloadWeights({
    model: 'https://huggingface.co/mlc-ai/Test-MLC',
    cache,
    fetch: fetcher,
    onProgress: (l) => seen.push(l),
  });
  assert.equal(total, 6500);
  assert.deepEqual([...cache.store.keys()].sort(), [
    `${BASE}params_shard_0.bin`,
    `${BASE}params_shard_1.bin`,
  ]);
  assert.equal(
    (await cache.store.get(`${BASE}params_shard_1.bin`)!.arrayBuffer())
      .byteLength,
    4000,
  );
  assert.equal(seen.at(-1), 6500);
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]));
});
test('skips cached shards and checks storage only for missing bytes', async () => {
  const cache = memoryCache();
  await cache.put(`${BASE}a.bin`, new Response(new Uint8Array(100)));
  const { fetcher, requests } = server({ 'a.bin': 100, 'b.bin': 300 });
  let missing = -1;
  const seen: number[] = [];
  await downloadWeights({
    model: BASE,
    cache,
    fetch: fetcher,
    onProgress: (l) => seen.push(l),
    beforeDownload: async (m) => void (missing = m),
  });
  assert.equal(missing, 300);
  assert.equal(seen[0], 100);
  assert.ok(!requests.includes(`${BASE}a.bin`));
});
test('a stalled shard is retried once, then reported', async () => {
  const { fetcher, requests } = server({ 'a.bin': 5000 }, { stallOn: 'a.bin' });
  await assert.rejects(
    downloadWeights({
      model: BASE,
      cache: memoryCache(),
      fetch: fetcher,
      stallMs: 30,
    }),
    /stalled/,
  );
  assert.equal(requests.filter((u) => u.endsWith('a.bin')).length, 2);
});
test('HTTP errors and cancellation surface', async () => {
  await assert.rejects(
    downloadWeights({
      model: BASE,
      cache: memoryCache(),
      fetch: server({ 'a.bin': 10 }, { status: 404 }).fetcher,
    }),
    /404/,
  );
  const controller = new AbortController();
  const { fetcher } = server({ 'a.bin': 5000 }, { stallOn: 'a.bin' });
  const p = downloadWeights({
    model: BASE,
    cache: memoryCache(),
    fetch: fetcher,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(p, (e: Error) => e.name === 'AbortError');
});
