import type {
  ChatCompletionMessageParam,
  WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
import { GpuLostError, isGpuLost } from './models';
import { WEBLLM_CACHE, checkStorage, downloadWeights } from './weights';
export const LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
type Progress = (text: string, value: number) => void;
interface Slot {
  worker: Worker;
  engine: WebWorkerMLCEngine | null;
  loading: Promise<WebWorkerMLCEngine>;
  reject: (reason: Error) => void;
  download: AbortController;
}
const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
const slots = new Map<string, Slot>();
const cancelled = () => new Error('Model loading cancelled.');
export function supportsGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
/** Loads (downloading if needed) a WebLLM model in its own worker; concurrent calls share one load. */
export function loadModel(
  model: string,
  progress: Progress,
): Promise<WebWorkerMLCEngine> {
  const existing = slots.get(model);
  if (existing)
    return existing.engine
      ? Promise.resolve(existing.engine)
      : existing.loading;
  if (!supportsGPU())
    return Promise.reject(
      new Error('WebGPU is unavailable in this browser. Search still works.'),
    );
  const worker = new Worker(
    new URL('../workers/chat.worker.ts', import.meta.url),
    { type: 'module' },
  );
  let reject!: (reason: Error) => void,
    timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new Promise<never>((_, r) => (reject = r));
  const slot: Slot = {
    worker,
    engine: null,
    loading: abort,
    reject,
    download: new AbortController(),
  };
  const report: Progress = (text, value) => {
    if (slots.get(model) === slot) progress(text, value);
  };
  slot.loading = (async () => {
    try {
      const { CreateWebWorkerMLCEngine, prebuiltAppConfig } =
        await import('@mlc-ai/web-llm');
      const record = prebuiltAppConfig.model_list.find(
        (m) => m.model_id === model,
      );
      // Stream the weights first so progress moves byte by byte (see weights.ts).
      if (record && typeof caches !== 'undefined')
        await Promise.race([
          downloadWeights({
            model: record.model,
            cache: await caches.open(WEBLLM_CACHE),
            signal: slot.download.signal,
            beforeDownload: checkStorage,
            onProgress: (loaded, total) =>
              report(
                `Downloading ${mb(loaded)} of ${mb(total)}`,
                total ? (0.9 * loaded) / total : 0,
              ),
          }),
          abort,
        ]);
      if (slots.get(model) !== slot) throw cancelled();
      report('Preparing the model on your GPU…', 0.9);
      // The timeout covers GPU setup only; slow downloads keep reporting progress instead.
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'Setting up the model took too long. Try a smaller model.',
            ),
          ),
        3 * 60 * 1000,
      );
      const engine = await Promise.race([
        CreateWebWorkerMLCEngine(
          worker,
          model,
          {
            initProgressCallback: (p) =>
              report(
                'Preparing the model on your GPU…',
                0.9 + 0.1 * p.progress,
              ),
          },
          { context_window_size: 2048 },
        ),
        abort,
      ]);
      if (slots.get(model) !== slot) throw cancelled();
      slot.engine = engine;
      return engine;
    } catch (error) {
      worker.terminate();
      if (slots.get(model) === slot) slots.delete(model);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })();
  slots.set(model, slot);
  return slot.loading;
}
export const isLoaded = (model: string) => !!slots.get(model)?.engine;
export async function isCached(model: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(model);
  } catch {
    return false;
  }
}
/** Stops a load or frees a loaded model's GPU memory. Downloaded weights stay cached. */
export function unloadModel(model: string) {
  const slot = slots.get(model);
  if (!slot) return;
  slots.delete(model);
  slot.download.abort();
  slot.reject(cancelled());
  slot.engine?.interruptGenerate();
  slot.worker.terminate();
}
/** Downloads a model into the browser cache without keeping it in GPU memory. */
export async function prefetchModel(model: string, progress: Progress) {
  if (slots.has(model) || (await isCached(model))) return;
  await loadModel(model, progress);
  unloadModel(model);
}
export function stopModel(model: string) {
  slots.get(model)?.engine?.interruptGenerate();
}
export async function deleteModel(model: string) {
  unloadModel(model);
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  await deleteModelAllInfoInCache(model);
}
export async function generate(
  model: string,
  messages: ChatCompletionMessageParam[],
  onToken: (token: string) => void,
  maxTokens = 384,
) {
  const engine = slots.get(model)?.engine;
  if (!engine) throw new Error('Load the on-device model first.');
  try {
    const result = await engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.3,
    });
    for await (const part of result) {
      const text = part.choices[0]?.delta.content;
      if (text) onToken(text);
    }
  } catch (e) {
    // WebLLM unloads itself when the GPU device is lost (usually out of
    // memory), so this engine is unusable: drop it and tell the caller.
    if (!isGpuLost(e)) throw e;
    unloadModel(model);
    throw new GpuLostError();
  }
}
// Single-model API used by the /lab/guide playground.
export const loadLocal = (progress: Progress) =>
  loadModel(LOCAL_MODEL, progress);
export const cancelLocal = () => unloadModel(LOCAL_MODEL);
export const stopLocal = () => stopModel(LOCAL_MODEL);
export const clearLocalCache = () => deleteModel(LOCAL_MODEL);
export const generateLocal = (
  messages: ChatCompletionMessageParam[],
  onToken: (token: string) => void,
) => generate(LOCAL_MODEL, messages, onToken);
