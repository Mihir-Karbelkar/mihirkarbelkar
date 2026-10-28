import { readTokens } from '../client-stream';
import { generate, stopModel } from '../local-engine';
import type { ModelManager } from '../model-manager';
import type { AnswerEngine } from './engine';
const aborted = () => new DOMException('Answer stopped.', 'AbortError');
/** The on-device WebLLM model Auto picked, if one is ready. */
export function localEngine(manager: ModelManager): AnswerEngine | null {
  const tier = manager.getState().active;
  if (!tier) return null;
  const model = manager.model(tier);
  return {
    id: tier,
    async generate(messages, onToken, signal) {
      const stop = () => stopModel(model);
      signal.addEventListener('abort', stop);
      try {
        await generate(model, messages, onToken, 320);
        if (signal.aborted) throw aborted();
      } finally {
        signal.removeEventListener('abort', stop);
      }
    },
  };
}
/**
 * The hosted fallback (/api/chat). The server runs its own retrieval and
 * system prompt, so only the conversation is sent.
 */
export function hostedEngine(): AnswerEngine {
  return {
    id: 'hosted',
    async generate(messages, onToken, signal) {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.role !== 'system')
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      await readTokens(res, onToken);
    },
  };
}
