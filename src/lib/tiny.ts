import type { Source } from './prompt.ts';
/**
 * Tiny 30M: the site's own question-answering model (pretrained from scratch,
 * fine-tuned to answer from retrieved passages and to refuse when they don't
 * say). One int8 ONNX graph on onnxruntime-web's WASM backend, so it runs on
 * devices without WebGPU. Built in the tiny-paraphraser repo (LEDGER §16–21).
 *
 * Input: `<rag> SOURCE 1: title\ntext … <q> question <sep>`. Output (round 3,
 * evidence first): `Source 2: "exact quote"\nAnswer: …`, `Source: none\nAnswer:
 * The context does not say.` to refuse, or `Chat: …` for small talk.
 */
/** Hugging Face model repo with the weights, pinned to a commit (Workers assets max out at 25 MB). */
const HF = 'https://huggingface.co/Mihir-Karbelkar/tiny-30m-site-qa/resolve/bc1caa4ef872c9db2f372f6f8b080a67de56183f';
export const TINY = {
  model: `${HF}/decoder.int8.onnx`,
  tokenizer: '/models/tiny30m/tokenizer.json',
  cache: 'tiny-v1',
  specials: { eos: 1, sep: 2, q: 3, ask: 5, rag: 7 },
  /** past: (layers, k|v, batch, kv heads, 1 masked dummy slot, head dim). */
  kvShape: [8, 2, 1, 2, 1, 64],
  maxPromptTokens: 1800,
  maxNewTokens: 160,
  repetitionPenalty: 1.1,
  /** Scored before answering: the start of the trained refusal. */
  refusal: 'Source: none',
  /** "Source" then ":" is the refusal branch; banning that ":" makes the model cite a source. */
  cite: 'Source:',
  /**
   * Refuse when p(refusal) is at least this, otherwise answer. At 0.3 the
   * model refuses ~96% of held-out questions its sources don't answer and
   * wrongly refuses ~5% it could answer (refusal AUROC 0.99).
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
