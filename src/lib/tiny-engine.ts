import { TINY } from './tiny';
import type { TinyRequest } from '../workers/tiny.worker';
/**
 * Page side of Tiny 30M (src/workers/tiny.worker.ts), shaped like
 * local-engine.ts's WebLLM functions so the model manager can treat it as a tier.
 */
type Progress = (text: string, value: number) => void;
interface Call {
  onToken: (t: string) => void;
  done: (refused: boolean) => void;
  fail: (e: Error) => void;
}
let worker: Worker | null = null,
  loading: Promise<void> | null = null,
  ready = false,
  seq = 0;
const calls = new Map<number, Call>();

function spawn(onMessage: (d: any) => void) {
  const w = new Worker(new URL('../workers/tiny.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.onmessage = (e) => onMessage(e.data);
  return w;
}
const send = (w: Worker, req: TinyRequest) => w.postMessage(req);

export function loadTiny(progress: Progress): Promise<void> {
  if (ready) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const w = spawn((d) => {
      if (d.type === 'progress') progress(d.text, d.value);
      else if (d.type === 'ready') {
        ready = true;
        resolve();
      } else if (d.type === 'error') {
        unloadTiny();
        reject(new Error(d.text));
      } else if (d.type === 'token') calls.get(d.id)?.onToken(d.text);
      else if (d.type === 'done') {
        const call = calls.get(d.id);
        calls.delete(d.id);
        if (d.error) call?.fail(new Error(d.error));
        else call?.done(!!d.refused);
      }
    });
    worker = w;
    send(w, { type: 'load' });
  });
  return loading;
}

export function unloadTiny() {
  worker?.terminate();
  worker = null;
  loading = null;
  ready = false;
  for (const c of calls.values()) c.fail(new Error('Model unloaded.'));
  calls.clear();
}

export async function isTinyCached(): Promise<boolean> {
  try {
    const cache = await caches.open(TINY.cache);
    return !!(await cache.match(TINY.model));
  } catch {
    return false;
  }
}

/** Downloads the weights into the cache without starting the model. */
export function prefetchTiny(progress: Progress): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = spawn((d) => {
      if (d.type === 'progress') progress(d.text, d.value);
      else if (d.type === 'ready' || d.type === 'error') {
        w.terminate();
        if (d.type === 'ready') resolve();
        else reject(new Error(d.text));
      }
    });
    send(w, { type: 'load', prefetch: true });
  });
}

export function stopTiny() {
  if (worker) send(worker, { type: 'stop' });
}

export async function deleteTiny() {
  unloadTiny();
  try {
    await caches.delete(TINY.cache);
  } catch {}
}

/**
 * Answers from `sources` (tinySources() text; empty for ordinary chat).
 * Streams tokens unless the model refuses; resolves with whether it refused.
 */
export function answerTiny(
  sources: string,
  question: string,
  onToken: (token: string) => void,
): Promise<boolean> {
  if (!worker || !ready) return Promise.reject(new Error('Load the on-device model first.'));
  const id = ++seq;
  return new Promise((done, fail) => {
    calls.set(id, { onToken, done, fail });
    send(worker!, { type: 'answer', id, sources, question });
  });
}
