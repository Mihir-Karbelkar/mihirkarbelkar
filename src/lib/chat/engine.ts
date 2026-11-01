import type { ChatMessage } from '../contracts.ts';
import type { Source } from '../prompt.ts';
/**
 * Anything that can write an answer: an on-device model today, a hosted
 * provider, or a future local-model SDK. The chat pipeline only sees this.
 */
export interface AnswerEngine {
  /** Stable id for diagnostics (never shown to visitors). */
  id: string;
  generate(
    messages: ({ role: 'system'; content: string } | ChatMessage)[],
    onToken: (token: string) => void,
    signal: AbortSignal,
  ): Promise<void>;
  /**
   * For models trained on a fixed retrieval format (Tiny 30M): answers from
   * the search results directly instead of the generic system prompt. The
   * pipeline uses it when present.
   */
  answer?(
    sources: Source[],
    query: string,
    onToken: (token: string) => void,
    signal: AbortSignal,
  ): Promise<AnswerCheck>;
}
/**
 * An engine's own verdict on its answer, replacing the pipeline's word-overlap
 * check: `grounded` false shows result cards instead; `chat` marks a reply to
 * small talk, shown without source links.
 */
export interface AnswerCheck {
  grounded: boolean;
  chat?: boolean;
}
