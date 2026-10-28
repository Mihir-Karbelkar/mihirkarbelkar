import type { APIRoute } from 'astro';
import { environment, json, protect, readJSON } from '../../lib/server';
import { infer } from '../../lib/providers';
import { searchContent, systemPrompt } from '../../lib/content';
import { validMessages } from '../../lib/validation';
export const POST: APIRoute = async (context) => {
  const env = environment(context);
  const denied = await protect(context, env);
  if (denied) return denied;
  let body;
  try {
    body = await readJSON(context.request);
  } catch {
    return json({ error: 'Invalid or oversized chat request.' }, 400);
  }
  if (!validMessages(body?.messages))
    return json(
      { error: 'Send up to six messages, each under 1,800 characters.' },
      400,
    );
  const refs = searchContent(body.messages.at(-1).content);
  if (!refs.length)
    return json(
      {
        error:
          'No published source matches this question. Please use Search or contact Mihir.',
      },
      422,
    );
  try {
    return await infer(
      env,
      [{ role: 'system', content: systemPrompt(refs) }, ...body.messages],
      context.request.signal,
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error ? e.message : 'Hosted inference is unavailable.',
      },
      503,
    );
  }
};
