import type {
  ChatCompletionMessageParam,
  WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
export const LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
type Progress = (text: string, value: number) => void;
interface Slot {
  worker: Worker;
  engine: WebWorkerMLCEngine | null;
  loading: Promise<WebWorkerMLCEngine>;
  reject: (reason: Error) => void;
}
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
  const abort = new Promise<never>((_, r) => {
    reject = r;
    timer = setTimeout(
      () =>
        r(
          new Error(
            'Model loading timed out. Retry on a faster connection or use Search.',
          ),
        ),
      10 * 60 * 1000,
    );
  });
  const slot: Slot = { worker, engine: null, loading: abort, reject };
  slot.loading = (async () => {
    try {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const engine = await Promise.race([
        CreateWebWorkerMLCEngine(
          worker,
          model,
          {
            initProgressCallback: (p) => {
              if (slots.get(model) === slot) progress(p.text, p.progress);
            },
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
