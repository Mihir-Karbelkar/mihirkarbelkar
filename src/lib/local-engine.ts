import type {
  ChatCompletionMessageParam,
  WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
export const LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
let worker: Worker | null = null,
  engine: WebWorkerMLCEngine | null = null;
let generation = 0;
let rejectLoad: ((reason: Error) => void) | null = null;
export function supportsGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
export async function loadLocal(
  progress: (text: string, value: number) => void,
) {
  if (engine) return engine;
  const current = ++generation;
  if (!supportsGPU())
    throw new Error(
      'WebGPU is unavailable in this browser. Search still works, or choose Hosted.',
    );
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu;
  if (!gpu || !(await gpu.requestAdapter()))
    throw new Error(
      'No compatible WebGPU adapter is available. Use Search or Hosted on this device.',
    );
  if (current !== generation) throw new Error('Model loading cancelled.');
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  if (current !== generation) throw new Error('Model loading cancelled.');
  const ownedWorker = new Worker(
    new URL('../workers/chat.worker.ts', import.meta.url),
    { type: 'module' },
  );
  worker = ownedWorker;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = await Promise.race([
      CreateWebWorkerMLCEngine(
        ownedWorker,
        LOCAL_MODEL,
        {
          initProgressCallback: (p) => {
            if (current === generation) progress(p.text, p.progress);
          },
        },
        { context_window_size: 2048 },
      ),
      new Promise<never>((_, reject) => {
        rejectLoad = reject;
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Model loading timed out. Retry on a faster connection or use Search.',
              ),
            ),
          5 * 60 * 1000,
        );
      }),
    ]);
    if (current !== generation) throw new Error('Model loading cancelled.');
    engine = loaded;
    return loaded;
  } catch (error) {
    ownedWorker.terminate();
    if (current === generation) worker = null;
    throw error;
  } finally {
    clearTimeout(timer);
    if (current === generation) rejectLoad = null;
  }
}
export function cancelLocal() {
  rejectLoad?.(new Error('Model loading cancelled.'));
  rejectLoad = null;
  generation++;
  engine?.interruptGenerate();
  worker?.terminate();
  worker = null;
  engine = null;
}
export function stopLocal() {
  engine?.interruptGenerate();
}
export async function clearLocalCache() {
  cancelLocal();
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  await deleteModelAllInfoInCache(LOCAL_MODEL);
}
export async function generateLocal(
  messages: ChatCompletionMessageParam[],
  onToken: (token: string) => void,
) {
  if (!engine) throw new Error('Load the on-device model first.');
  const result = await engine.chat.completions.create({
    messages,
    stream: true,
    max_tokens: 384,
    temperature: 0.3,
  });
  for await (const part of result) {
    const text = part.choices[0]?.delta.content;
    if (text) onToken(text);
  }
}
