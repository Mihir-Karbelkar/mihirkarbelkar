import type { Source } from './prompt.ts';
/**
 * Tiny 30M: the site's own question-answering model (pretrained from scratch,
 * fine-tuned to answer from retrieved passages and to refuse when they don't
 * say). One int8 ONNX graph on onnxruntime-web's WASM backend, so it runs on
 * devices without WebGPU. Built in the tiny-paraphraser repo (LEDGER §16–19).
 *
 * Input: `<rag> SOURCE 1: title\ntext … <q> question <sep>`, or
 * `<ask> question <sep>` when there are no sources.
 */
/** Hugging Face model repo with the weights, pinned to a commit (Workers assets max out at 25 MB). */
const HF = 'https://huggingface.co/Mihir-Karbelkar/tiny-30m-site-qa/resolve/7349ba1dd683d25912e2b83a9b724300025ecb7b';
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
  /** The trained refusal, scored before answering. */
  refusal: 'The context does not say.',
  /**
   * Refuse when p(refusal) is at least this, otherwise answer. At 0.3 the
   * int8 model refuses ~96% of held-out questions its sources don't answer
   * and wrongly refuses ~5% it could answer.
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
 * within the passage and character budgets.
 */
export function tinySources(sources: Source[]) {
  const passages = sources.flatMap((s) =>
    s.text
      .split(' … ')
      .map((text) => ({ title: s.title, text: text.trim() }))
      .filter((p) => p.text),
  );
  const blocks: string[] = [];
  let used = 0;
  for (const p of passages.slice(0, TINY.maxPassages)) {
    if (used + p.text.length > TINY.budget && blocks.length) break;
    blocks.push(`SOURCE ${blocks.length + 1}: ${p.title}\n${thirdPerson(p.text)}`);
    used += p.text.length;
  }
  return blocks.join('\n\n');
}
