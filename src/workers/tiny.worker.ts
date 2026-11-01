/**
 * Tiny 30M in onnxruntime-web (WASM). One graph reads the prompt and
 * generates: decoder(input_ids, past) -> last-position logits and the grown
 * cache, which starts with one dummy slot the graph masks out.
 *
 * Evidence first: it scores the refusal ("Source: none") and refuses when that
 * is at least `refusalThreshold` likely. Otherwise it must cite a source
 * (`Source n: "quote"`), and the quote is checked against that source before
 * any of the answer is streamed; an unverified quote ends the reply. `Chat:`
 * replies to small talk stream as they are.
 */
import * as ort from 'onnxruntime-web/wasm';
import { PreTrainedTokenizer } from '@huggingface/transformers';
import { TINY, parseEvidence, quoteInSource } from '../lib/tiny';

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
// threads need SharedArrayBuffer, i.e. a cross-origin isolated page
ort.env.wasm.numThreads = self.crossOriginIsolated
  ? Math.min(4, navigator.hardwareConcurrency || 1)
  : 1;

type Loaded = { decoder: ort.InferenceSession; tokenizer: PreTrainedTokenizer };
let ready: Promise<Loaded> | null = null;
let stopped = 0;

export type TinyRequest =
  | { type: 'load'; prefetch?: boolean }
  | { type: 'stop' }
  | { type: 'answer'; id: number; sources: string; question: string };

const progress = (value: number, text: string) =>
  self.postMessage({ type: 'progress', value, text });

/** Fetches through the Cache API, so the weights download once per browser. */
async function download(url: string, share: [number, number]) {
  const cache = await caches.open(TINY.cache).catch(() => null);
  const cached = await cache?.match(url);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('Could not download the model.');
  const total = Number(response.headers.get('Content-Length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total)
      progress(
        share[0] + (received / total) * (share[1] - share[0]),
        `Downloading ${Math.round(received / 1e6)} MB of ${Math.round(total / 1e6)} MB`,
      );
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  await cache?.put(url, new Response(out)).catch(() => {});
  return out;
}

async function load(): Promise<Loaded> {
  const [tokenizerBytes, decoderBytes] = await Promise.all([
    download(TINY.tokenizer, [0, 0]),
    download(TINY.model, [0, 0.95]),
  ]);
  progress(0.97, 'Starting the model…');
  return {
    tokenizer: new PreTrainedTokenizer(
      JSON.parse(new TextDecoder().decode(tokenizerBytes)),
      { clean_up_tokenization_spaces: false },
    ),
    decoder: await ort.InferenceSession.create(decoderBytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }),
  };
}

const int64 = (ids: number[]) =>
  new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]);
const emptyPast = () =>
  new ort.Tensor(
    'float32',
    new Float32Array(TINY.kvShape.reduce((a, b) => a * b, 1)),
    TINY.kvShape,
  );

function logSoftmaxAt(logits: Float32Array, id: number) {
  let max = -Infinity;
  for (const x of logits) if (x > max) max = x;
  let sum = 0;
  for (const x of logits) sum += Math.exp(x - max);
  return logits[id] - max - Math.log(sum);
}

async function answer(id: number, sources: string, question: string) {
  const { decoder, tokenizer } = await ready!;
  const run = stopped;
  const encode = (text: string) =>
    tokenizer.encode(text, { add_special_tokens: false });
  const { specials: sp } = TINY;
  const q = encode(question).slice(-TINY.maxPromptTokens);
  const s = encode(sources).slice(0, Math.max(0, TINY.maxPromptTokens - q.length - 3));
  const prompt = [sp.rag, ...s, sp.q, ...q, sp.sep];

  let out = await decoder.run({ input_ids: int64(prompt), past: emptyPast() });
  const first = out.logits.data as Float32Array;
  const afterPrompt = out.present;

  // p(refusal) is the product of its token probabilities; stop once it's clearly below threshold
  const refusal = encode(TINY.refusal);
  const minLog = Math.log(TINY.refusalThreshold);
  let logp = logSoftmaxAt(first, refusal[0]);
  let past = afterPrompt;
  for (let i = 1; i < refusal.length && logp >= minLog; i++) {
    const r = await decoder.run({ input_ids: int64([refusal[i - 1]]), past });
    past = r.present;
    logp += logSoftmaxAt(r.logits.data as Float32Array, refusal[i]);
  }
  if (logp >= minLog) {
    self.postMessage({ type: 'done', id, kind: 'refused' });
    return;
  }

  // greedy, with a repetition penalty on the reply's own tokens; "Source" may not be followed by ":"
  const cite = encode(TINY.cite);
  const generated: number[] = [];
  let logits = first;
  past = afterPrompt;
  let sent = 0;
  let source = 0;
  let verdict: 'answer' | 'chat' | 'unverified' = 'unverified';
  for (let i = 0; i < TINY.maxNewTokens && run === stopped; i++) {
    const l = Float32Array.from(logits);
    for (const t of new Set(generated))
      l[t] = l[t] > 0 ? l[t] / TINY.repetitionPenalty : l[t] * TINY.repetitionPenalty;
    if (generated.length === 1 && generated[0] === cite[0]) l[cite[1]] = -Infinity;
    let next = 0;
    for (let j = 1; j < l.length; j++) if (l[j] > l[next]) next = j;
    if (next === sp.eos) break;
    generated.push(next);
    const text = tokenizer.decode(generated, { skip_special_tokens: true });
    const e = parseEvidence(text);
    if (e.kind === 'malformed') break;
    if (e.kind === 'answer' && verdict === 'unverified') {
      if (!quoteInSource(sources, e.source, e.quote)) break; // a made-up quote: show nothing
      verdict = 'answer';
      source = e.source;
    } else if (e.kind === 'chat') verdict = 'chat';
    if ((e.kind === 'answer' || e.kind === 'chat') && e.answer.length > sent && !e.answer.endsWith('\uFFFD')) {
      self.postMessage({ type: 'token', id, text: e.answer.slice(sent) });
      sent = e.answer.length;
    }
    out = await decoder.run({ input_ids: int64([next]), past });
    past = out.present;
    logits = out.logits.data as Float32Array;
  }
  self.postMessage({ type: 'done', id, kind: sent ? verdict : 'unverified', source });
}

self.onmessage = async (event: MessageEvent<TinyRequest>) => {
  const data = event.data;
  if (data.type === 'stop') {
    stopped++;
    return;
  }
  if (data.type === 'load') {
    try {
      if (data.prefetch) {
        await Promise.all([download(TINY.tokenizer, [0, 0]), download(TINY.model, [0, 1])]);
      } else {
        ready ??= load();
        await ready;
      }
      self.postMessage({ type: 'ready' });
    } catch (e) {
      ready = null;
      self.postMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'The model failed to load.',
      });
    }
    return;
  }
  try {
    await answer(data.id, data.sources, data.question);
  } catch (e) {
    self.postMessage({
      type: 'done',
      id: data.id,
      error: e instanceof Error ? e.message : 'The model failed.',
    });
  }
};
