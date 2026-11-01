import { readTokens } from '../client-stream';
import { TINY_MODEL, generate, stopModel } from '../local-engine';
import { NOT_COVERED_REPLY } from '../prompt';
import { tinySources } from '../tiny';
import { answerTiny } from '../tiny-engine';
import type { ModelManager } from '../model-manager';
import type { AnswerEngine } from './engine';
const aborted = () => new DOMException('Answer stopped.', 'AbortError');
/** The on-device WebLLM model Auto picked, if one is ready. */
export function localEngine(manager: ModelManager): AnswerEngine | null {
  const tier = manager.getState().active;
  if (!tier) return null;
  const model = manager.model(tier);
  if (model === TINY_MODEL) return tinyEngine();
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
 * Tiny 30M answers from the search results in its trained format, citing the
 * passage it quoted; a refusal becomes the site's "not covered" reply and an
 * unverified quote shows result cards.
 */
function tinyEngine(): AnswerEngine {
  return {
    id: TINY_MODEL,
    async answer(sources, query, onToken, signal) {
      const stop = () => stopModel(TINY_MODEL);
      signal.addEventListener('abort', stop);
      try {
        const passages = tinySources(sources);
        const reply = await answerTiny(passages.text, query, onToken);
        if (signal.aborted) throw aborted();
        if (reply.kind === 'refused') onToken(NOT_COVERED_REPLY);
        if (reply.kind === 'answer' && reply.source)
          onToken(` [${passages.sourceOf[reply.source - 1] + 1}]`);
        return { grounded: reply.kind !== 'unverified', chat: reply.kind === 'chat' };
      } finally {
        signal.removeEventListener('abort', stop);
      }
    },
    // only ever called with search results (answer() above); without them there's nothing to cite
    async generate(_messages, onToken) {
      onToken(NOT_COVERED_REPLY);
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
