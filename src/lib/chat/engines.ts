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
 * Tiny 30M answers from the search results in its trained format; its
 * refusal becomes the site's "not covered" reply.
 */
function tinyEngine(): AnswerEngine {
  const run = async (sources: string, query: string, onToken: (t: string) => void, signal: AbortSignal) => {
    const stop = () => stopModel(TINY_MODEL);
    signal.addEventListener('abort', stop);
    try {
      const refused = await answerTiny(sources, query, onToken);
      if (signal.aborted) throw aborted();
      if (refused) onToken(NOT_COVERED_REPLY);
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };
  return {
    id: TINY_MODEL,
    answer: (sources, query, onToken, signal) =>
      run(tinySources(sources), query, onToken, signal),
    // without search results it answers as ordinary chat
    generate: (messages, onToken, signal) =>
      run('', messages.filter((m) => m.role === 'user').at(-1)?.content ?? '', onToken, signal),
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
