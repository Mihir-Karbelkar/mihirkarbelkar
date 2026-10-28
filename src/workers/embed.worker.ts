import { pipeline, env } from '@huggingface/transformers';
import { EMBED_MODEL } from '../lib/text';
env.allowLocalModels = false;
let extractor: any;
export type EmbedRequest = { id: number; texts: string[] };
export type EmbedResponse =
  | { id: number; type: 'progress'; progress: number; text: string }
  | { id: number; type: 'result'; data: Float32Array; dims: number }
  | { id: number; type: 'error'; text: string };
const post = (m: EmbedResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);
self.onmessage = async ({
  data: { id, texts },
}: MessageEvent<EmbedRequest>) => {
  try {
    extractor ??= await pipeline('feature-extraction', EMBED_MODEL, {
      dtype: 'q8',
      progress_callback: (p: any) => {
        if (p.status === 'progress')
          post({
            id,
            type: 'progress',
            progress: (p.progress || 0) / 100,
            text: `Loading the search model (${Math.round(p.progress || 0)}%)`,
          });
      },
    });
    const out: Float32Array[] = [];
    // Small batches keep the worker responsive and progress visible.
    for (let i = 0; i < texts.length; i += 8) {
      const t = await extractor(texts.slice(i, i + 8), {
        pooling: 'mean',
        normalize: true,
      });
      out.push(t.data as Float32Array);
      if (texts.length > 8)
        post({
          id,
          type: 'progress',
          progress: Math.min(1, (i + 8) / texts.length),
          text: `Indexing the site (${Math.min(i + 8, texts.length)}/${texts.length})`,
        });
    }
    const data = new Float32Array(out.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of out) data.set(a, (offset += a.length) - a.length);
    post({ id, type: 'result', data, dims: data.length / texts.length }, [
      data.buffer,
    ]);
  } catch (e) {
    post({
      id,
      type: 'error',
      text: e instanceof Error ? e.message : 'Embedding failed.',
    });
  }
};
