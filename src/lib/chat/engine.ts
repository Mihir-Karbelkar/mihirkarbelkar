import type { ChatMessage } from '../contracts.ts';
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
}
