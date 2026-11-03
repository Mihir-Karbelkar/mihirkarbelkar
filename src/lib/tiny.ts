import type { Source } from './prompt.ts';
/**
 * The site's own question-answering models, Ant 15M and Tiny 30M (pretrained from
 * scratch, fine-tuned to answer from retrieved passages and to refuse when they
 * don't say). Each is one int8 ONNX graph on onnxruntime-web's WASM backend, so
 * it runs on devices without WebGPU. Built in the tiny-paraphraser repo (LEDGER §16–31).
 *
 * Input: `<rag> SOURCE 1: title\ntext … <q> question <sep>`. Output (round 3,
 * evidence first): `Source 2: "exact quote"\nAnswer: …`, `Source: none\nAnswer:
 * The context does not say.` to refuse, or `Chat: …` for small talk.
 */
export type OnnxModelId = 'ant-15m' | 'tiny-30m';
/** A graph state tensor: fed as `input` (zeros at the start), returned as `output` for the next call. */
export interface OnnxState {
  input: string;
  output: string;
  shape: number[];
}
export interface OnnxModel {
  id: OnnxModelId;
  /** Hugging Face weights pinned to a commit (Workers assets max out at 25 MB). */
  model: string;
  cache: string;
  states: OnnxState[];
  /** Prompt tokens per call; 0 reads the prompt in one call. */
  promptChunk: number;
}
const hf = (repo: string, commit: string) =>
  `https://huggingface.co/Mihir-Karbelkar/${repo}/resolve/${commit}/decoder.int8.onnx`;
/**
 * Ant 15M's states, from its layer pattern: per attention layer a key/value cache
 * (k|v, batch, kv heads, 1 masked dummy slot, head dim) that grows with each call, per Mamba2
 * layer a conv window and an SSM state of fixed size. Named by position (kv0, conv1, ssm2, …).
 */
function antStates(pattern: string): OnnxState[] {
  const shapes: [string, number[]][] = [...pattern].flatMap((kind): [string, number[]][] =>
    kind === 'A'
      ? [['kv', [2, 1, 2, 1, 64]]]
      : [
          ['conv', [1, 768, 3]],
          ['ssm', [1, 10, 64, 64]],
        ],
  );
  return shapes.map(([name, shape], i) => ({ input: `${name}${i}`, output: `new_${name}${i}`, shape }));
}
/**
 * The site's own models. Ant 15M (attention + Mamba2, LEDGER §26–31) replaced Tiny 30M as the
 * better one: half the download, faster per token, as good on the site's questions. Same
 * tokenizer, prompt and output format, so everything below is shared.
 */
export const ONNX_MODELS: Record<OnnxModelId, OnnxModel> = {
  'ant-15m': {
    id: 'ant-15m',
    model: hf('ant-15m-site-qa', 'd7df8a2a80d6a0e92247d9948a3f7c2e2832f6e1'),
    cache: 'ant-v1',
    states: antStates('AMAMAMAM'),
    // Mamba2 reads a prompt in a form quadratic in its length; chunks keep that cheap (exact: states carry over)
    promptChunk: 256,
  },
  'tiny-30m': {
    id: 'tiny-30m',
    model: hf('tiny-30m-site-qa', 'bc1caa4ef872c9db2f372f6f8b080a67de56183f'),
    cache: 'tiny-v1',
    /** past: (layers, k|v, batch, kv heads, 1 masked dummy slot, head dim). */
    states: [{ input: 'past', output: 'present', shape: [8, 2, 1, 2, 1, 64] }],
    promptChunk: 0,
  },
};
export const isOnnxModel = (model: string): model is OnnxModelId => model in ONNX_MODELS;
export const TINY = {
  tokenizer: '/models/tiny30m/tokenizer.json',
  specials: { eos: 1, sep: 2, q: 3, ask: 5, rag: 7 },
  maxPromptTokens: 1800,
  maxNewTokens: 160,
  repetitionPenalty: 1.1,
  /** Scored before answering: the start of the trained refusal. */
  refusal: 'Source: none',
  /** "Source" then ":" is the refusal branch; banning that ":" makes the model cite a source. */
  cite: 'Source:',
  /**
   * Refuse when p(refusal) is at least this, otherwise answer. At 0.3 both
   * models refuse ~96% of held-out questions their sources don't answer and
   * wrongly refuse ~5–7% they could answer (refusal AUROC 0.99).
   */
  refusalThreshold: 0.3,
  /** Characters of passages per prompt (its training prompts held up to 3,000). */
  budget: 2000,
  /** Passages per prompt: weak extra passages mislead it more than they help. */
  maxPassages: 3,
  /** The site says "I"; visitors ask about Mihir by name. */
  person: 'Mihir',
};

const FIRST_PERSON: [RegExp, string][] = [
  [/\bI[’']m\b/g, '$ is'],
  [/\bI[’']ve\b/g, '$ has'],
  [/\bI[’']d\b/g, '$ would'],
  [/\bI[’']ll\b/g, '$ will'],
  [/\bI\b/g, '$'],
  [/\b[Mm]y\b/g, '$’s'],
  [/\bme\b/g, '$'],
];

/**
 * "I’ve worked on…" → "Mihir has worked on…". The model answers questions
 * about Mihir far better from third-person sources (+2–3 of 23 site
 * questions in tiny-paraphraser's site_eval.py).
 */
export function thirdPerson(text: string, name = TINY.person) {
  return FIRST_PERSON.reduce(
    (t, [pattern, by]) => t.replace(pattern, by.replace('$', name)),
    text,
  );
}

/**
 * Search results in the model's training format, best first: each source's
 * chunks (joined with " … " by hybridSearch) become separate passages, kept
 * within the passage and character budgets. `sourceOf[i]` is the index in
 * `sources` of passage i + 1, for citation links.
 */
export function tinySources(sources: Source[]) {
  const passages = sources.flatMap((s, i) =>
    s.text
      .split(' … ')
      .map((text) => ({ title: s.title, text: text.trim(), source: i }))
      .filter((p) => p.text),
  );
  const blocks: string[] = [];
  const sourceOf: number[] = [];
  let used = 0;
  for (const p of passages.slice(0, TINY.maxPassages)) {
    if (used + p.text.length > TINY.budget && blocks.length) break;
    blocks.push(`SOURCE ${blocks.length + 1}: ${p.title}\n${thirdPerson(p.text)}`);
    sourceOf.push(p.source);
    used += p.text.length;
  }
  return { text: blocks.join('\n\n'), sourceOf };
}

export type Evidence =
  | { kind: 'answer'; source: number; quote: string; answer: string }
  | { kind: 'chat'; answer: string }
  | { kind: 'pending' }
  | { kind: 'malformed' };

/** Reads the model's output so far: which kind of reply it is, and the answer text once it starts. */
export function parseEvidence(text: string): Evidence {
  const t = text.trimStart();
  const chat = /^Chat:\s*([\s\S]*)$/.exec(t);
  if (chat) return { kind: 'chat', answer: chat[1] };
  const m = /^Source (\d+): "([^"\n]*)"\s*\nAnswer:\s?([\s\S]*)$/.exec(t);
  if (m) return { kind: 'answer', source: +m[1], quote: m[2], answer: m[3] };
  // still writing the evidence line: a prefix of `Source n: "…"\nAnswer: ` or `Chat:`
  if (!t || 'Chat:'.startsWith(t) || 'Source'.startsWith(t)) return { kind: 'pending' };
  if (/^Source \d*(:\s*("[^"\n]*("\s*(\n\s*(A|An|Ans|Answ|Answe|Answer)?)?)?)?)?$/.test(t))
    return { kind: 'pending' };
  return { kind: 'malformed' };
}

const squash = (s: string) =>
  s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether `quote` really occurs in passage `n` (1-based) of a tinySources() text. */
export function quoteInSource(sources: string, n: number, quote: string) {
  const block = sources.split(/\n\n(?=SOURCE \d+: )/)[n - 1];
  return !!block && squash(quote).length > 2 && squash(block).includes(squash(quote));
}
