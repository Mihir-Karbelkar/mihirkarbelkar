import type { Intent } from '../intent.ts';
import type { ActionId } from '../router.ts';
import { toIntent } from '../router.ts';
import type { Source } from '../prompt.ts';
import { systemPrompt } from '../prompt.ts';
import type { ChatMessage } from '../contracts.ts';
import { GpuLostError } from '../models.ts';
import type { AnswerEngine } from './engine.ts';
import {
  finalizeAnswer,
  isGrounded,
  plainAnswer,
  type Segment,
} from './answer.ts';
export type CardReason = 'no-engine' | 'ungrounded' | 'error' | 'empty';
export type Outcome =
  /** Navigation, tour or a site action: the UI performs it. */
  | { kind: 'intent'; intent: Intent }
  | {
      kind: 'answer';
      text: string;
      segments: Segment[];
      sources: Source[];
      engine: string;
    }
  | { kind: 'cards'; intro: string; sources: Source[]; reason: CardReason };
export interface ChatCopy {
  found: string;
  ungrounded: string;
  empty: string;
  error: string;
}
export interface Budgets {
  /** The MiniLM router, only consulted when warm. */
  route: number;
  /** Hybrid (vector + keyword) search before falling back to keywords. */
  search: number;
  /** Time for the model's first token (prefill is slow on phones). */
  firstToken: number;
  /** Longest gap between tokens before the answer is abandoned. */
  idle: number;
}
export const DEFAULT_BUDGETS: Budgets = {
  route: 1200,
  search: 6000,
  firstToken: 30000,
  idle: 15000,
};
export interface ChatDeps {
  rules(query: string): Intent;
  /** Semantic action router; skipped unless `routerWarm()`. */
  route?(query: string): Promise<ActionId | null>;
  routerWarm?(): boolean;
  search(query: string): Promise<Source[]>;
  /** Instant keyword search used when `search` fails or is too slow. */
  keywordSearch(query: string): Promise<Source[]>;
  /** The engine to answer with right now, or null for result cards. */
  engine(): AnswerEngine | null;
  onGpuLost?(engineId: string): void;
  copy: ChatCopy;
  budgets?: Partial<Budgets>;
}
export type Progress =
  | { stage: 'searching' }
  | { stage: 'writing'; partial: string; sources: Source[] };
export class StageTimeout extends Error {
  name = 'StageTimeout';
}
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new StageTimeout()), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
const FOLLOW_UP =
  /^(it|its|it's|that|this|those|they|them|their|and|also|so|what about|how about|why|more|tell me more|and then|then)\b/i;
/** Short or pronoun-led follow-ups are searched together with the previous question. */
export function retrievalQuery(query: string, history: ChatMessage[]): string {
  const previous = [...history].reverse().find((m) => m.role === 'user');
  if (!previous) return query;
  const short = query.trim().split(/\s+/).length < 6;
  return short || FOLLOW_UP.test(query.trim())
    ? `${previous.content} ${query}`
    : query;
}
/** Streams an answer, abandoning it if the first token or any later token takes too long. */
function generateWithWatchdog(
  engine: AnswerEngine,
  messages: Parameters<AnswerEngine['generate']>[0],
  onToken: (t: string) => void,
  { firstToken, idle }: Budgets,
  outer?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer?.addEventListener('abort', abort);
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort();
        reject(new StageTimeout());
      }, ms);
    };
    arm(firstToken);
    engine
      .generate(
        messages,
        (t) => {
          arm(idle);
          onToken(t);
        },
        controller.signal,
      )
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);
        outer?.removeEventListener('abort', abort);
      });
  });
}
/**
 * One chat turn. Every stage has a time budget and degrades to the next
 * (router → hybrid search → keyword search → model → result cards), so a
 * turn always ends with something useful and never hangs.
 */
export async function runChat(
  query: string,
  history: ChatMessage[],
  deps: ChatDeps,
  onProgress: (p: Progress) => void = () => {},
  signal?: AbortSignal,
): Promise<Outcome> {
  const budgets = { ...DEFAULT_BUDGETS, ...deps.budgets };
  const rule = deps.rules(query);
  if (rule.kind !== 'answer') return { kind: 'intent', intent: rule };
  if (deps.route && deps.routerWarm?.()) {
    const action = await withTimeout(deps.route(query), budgets.route).catch(
      () => null,
    );
    if (action) return { kind: 'intent', intent: toIntent(action) };
  }
  onProgress({ stage: 'searching' });
  const q = retrievalQuery(query, history);
  let sources: Source[];
  try {
    sources = await withTimeout(deps.search(q), budgets.search);
  } catch {
    try {
      sources = await withTimeout(deps.keywordSearch(q), budgets.search);
    } catch {
      return {
        kind: 'cards',
        intro: deps.copy.error,
        sources: [],
        reason: 'error',
      };
    }
  }
  if (!sources.length)
    return { kind: 'cards', intro: deps.copy.empty, sources, reason: 'empty' };
  const engine = deps.engine();
  if (!engine)
    return {
      kind: 'cards',
      intro: deps.copy.found,
      sources,
      reason: 'no-engine',
    };
  let text = '';
  try {
    await generateWithWatchdog(
      engine,
      [
        { role: 'system', content: systemPrompt(sources) },
        ...history.slice(-2).map(({ role, content }) => ({ role, content })),
        { role: 'user', content: query },
      ],
      (t) => {
        text += t;
        onProgress({ stage: 'writing', partial: text, sources });
      },
      budgets,
      signal,
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof GpuLostError) deps.onGpuLost?.(engine.id);
    return { kind: 'cards', intro: deps.copy.error, sources, reason: 'error' };
  }
  if (!isGrounded(text, sources))
    return {
      kind: 'cards',
      intro: deps.copy.ungrounded,
      sources,
      reason: 'ungrounded',
    };
  return {
    kind: 'answer',
    text: plainAnswer(text),
    segments: finalizeAnswer(text, sources),
    sources,
    engine: engine.id,
  };
}
