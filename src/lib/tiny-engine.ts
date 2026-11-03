import { ONNX_MODELS, type OnnxModelId } from './tiny';
import type { TinyRequest } from '../workers/tiny.worker';
/**
 * Page side of the site's own models (src/workers/tiny.worker.ts, one worker per
 * model), shaped like local-engine.ts's WebLLM functions so the model manager can
 * treat each as a tier.
 */
type Progress = (text: string, value: number) => void;
/**
 * How a reply ended: refused (the sources don't say), answer (quote verified
 * in passage `source`), chat (small talk), or unverified (nothing shown).
 */
export interface TinyReply {
  kind: 'refused' | 'answer' | 'chat' | 'unverified';
  source?: number;
}
interface Call {
  onToken: (t: string) => void;
  done: (reply: TinyReply) => void;
  fail: (e: Error) => void;
}
interface Slot {
  worker: Worker;
  loading: Promise<void>;
  ready: boolean;
  calls: Map<number, Call>;
}
const slots = new Map<OnnxModelId, Slot>();
let seq = 0;

function spawn(onMessage: (d: any) => void) {
  const w = new Worker(new URL('../workers/tiny.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.onmessage = (e) => onMessage(e.data);
  return w;
}
const send = (w: Worker, req: TinyRequest) => w.postMessage(req);

export function loadTiny(model: OnnxModelId, progress: Progress): Promise<void> {
  const existing = slots.get(model);
  if (existing) return existing.loading;
  const calls = new Map<number, Call>();
  let slot!: Slot;
  const loading = new Promise<void>((resolve, reject) => {
    const w = spawn((d) => {
      if (d.type === 'progress') progress(d.text, d.value);
      else if (d.type === 'ready') {
        slot.ready = true;
        resolve();
      } else if (d.type === 'error') {
        unloadTiny(model);
        reject(new Error(d.text));
      } else if (d.type === 'token') calls.get(d.id)?.onToken(d.text);
      else if (d.type === 'done') {
        const call = calls.get(d.id);
        calls.delete(d.id);
        if (d.error) call?.fail(new Error(d.error));
        else call?.done({ kind: d.kind, source: d.source });
      }
    });
    slot = { worker: w, loading: Promise.resolve(), ready: false, calls };
    send(w, { type: 'load', model });
  });
  slot.loading = loading;
  slots.set(model, slot);
  return loading;
}

export function unloadTiny(model: OnnxModelId) {
  const slot = slots.get(model);
  if (!slot) return;
  slots.delete(model);
  slot.worker.terminate();
  for (const c of slot.calls.values()) c.fail(new Error('Model unloaded.'));
  slot.calls.clear();
}

export async function isTinyCached(model: OnnxModelId): Promise<boolean> {
  try {
    const cache = await caches.open(ONNX_MODELS[model].cache);
    return !!(await cache.match(ONNX_MODELS[model].model));
  } catch {
    return false;
  }
}

/** Downloads the weights into the cache without starting the model. */
export function prefetchTiny(model: OnnxModelId, progress: Progress): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = spawn((d) => {
      if (d.type === 'progress') progress(d.text, d.value);
      else if (d.type === 'ready' || d.type === 'error') {
        w.terminate();
        if (d.type === 'ready') resolve();
        else reject(new Error(d.text));
      }
    });
    send(w, { type: 'load', model, prefetch: true });
  });
}

export function stopTiny(model: OnnxModelId) {
  const slot = slots.get(model);
  if (slot) send(slot.worker, { type: 'stop' });
}

export async function deleteTiny(model: OnnxModelId) {
  unloadTiny(model);
  try {
    await caches.delete(ONNX_MODELS[model].cache);
  } catch {}
}

/**
 * Answers from `sources` (tinySources() text). Streams the answer only once its
 * quote is verified; resolves with how the reply ended.
 */
export function answerTiny(
  model: OnnxModelId,
  sources: string,
  question: string,
  onToken: (token: string) => void,
): Promise<TinyReply> {
  const slot = slots.get(model);
  if (!slot?.ready) return Promise.reject(new Error('Load the on-device model first.'));
  const id = ++seq;
  return new Promise((done, fail) => {
    slot.calls.set(id, { onToken, done, fail });
    send(slot.worker, { type: 'answer', id, sources, question });
  });
}
