import { dot } from './retrieval.ts';
import type { Intent } from './intent.ts';
export type ActionId = 'theme-light' | 'theme-dark' | 'tour' | 'top';
export interface ActionSpec {
  id: ActionId;
  reply: string;
  examples: string[];
}
/** One example phrase per row; `actions[i]` is what row i means. */
export interface Exemplars {
  texts: string[];
  actions: ActionId[];
}
export function buildExemplars(specs: ActionSpec[]): Exemplars {
  const texts: string[] = [],
    actions: ActionId[] = [];
  for (const s of specs)
    for (const e of s.examples) {
      texts.push(e);
      actions.push(s.id);
    }
  return { texts, actions };
}
export const toIntent = (id: ActionId): Intent =>
  id === 'tour' ? { kind: 'tour' } : { kind: 'action', action: id };
/** Questions go to the LLM even when they mention an action ("how does dark mode work?"). */
const QUESTION =
  /^(what|why|how|who|when|where|which|does|did|is|are|can you tell|tell me)\b/i;
/**
 * The Auto router: MiniLM (already loaded for search) compares the message
 * with the example phrases. A confident match is a site action handled
 * without the LLM; anything else is a question.
 */
export function routeByExample(
  query: string,
  queryVector: ArrayLike<number>,
  exemplars: Exemplars,
  vectors: ArrayLike<number>[],
  { min = 0.62, margin = 0.03 } = {},
): ActionId | null {
  if (QUESTION.test(query.trim()) || vectors.length !== exemplars.texts.length)
    return null;
  const best = new Map<ActionId, number>();
  vectors.forEach((v, i) => {
    const a = exemplars.actions[i],
      s = dot(queryVector, v);
    if (s > (best.get(a) ?? -1)) best.set(a, s);
  });
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (!top || top[1] < min) return null;
  // Ambiguous between two different actions (e.g. light vs dark): don't guess.
  if (second && top[1] - second[1] < margin) return null;
  return top[0];
}
