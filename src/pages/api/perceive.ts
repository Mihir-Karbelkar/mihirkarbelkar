import type { APIRoute } from 'astro';
import { environment, json, protect, readJSON } from '../../lib/server';
export const POST: APIRoute = async (context) => {
  const env = environment(context);
  const denied = await protect(context, env);
  if (denied) return denied;
  if (!env.BRAIN_API_URL || !env.BRAIN_API_TOKEN)
    return json(
      {
        error:
          'Live perception needs a configured V-JEPA service. The synthetic simulation is still available.',
      },
      503,
    );
  let body;
  try {
    body = await readJSON(context.request, 1500000);
  } catch {
    return json({ error: 'Invalid or oversized frame payload.' }, 400);
  }
  if (
    !Array.isArray(body?.frames) ||
    body.frames.length !== 16 ||
    !body.frames.every(
      (f: unknown) =>
        typeof f === 'string' &&
        f.length < 90000 &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f),
    )
  )
    return json(
      { error: 'Send exactly 16 JPEG frames under 90 KB each.' },
      400,
    );
  try {
    const url = new URL('/perceive', env.BRAIN_API_URL);
    if (
      url.protocol !== 'https:' &&
      !(
        import.meta.env.DEV && ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
    )
      throw new Error();
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.any([
        context.request.signal,
        AbortSignal.timeout(90000),
      ]),
      headers: {
        Authorization: `Bearer ${env.BRAIN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ frames: body.frames }),
    });
    if (!response.ok)
      return json(
        {
          error:
            'The perception service is busy or unavailable. Please retry later.',
        },
        502,
      );
    const result = await response.json();
    return json(result);
  } catch {
    return json(
      {
        error:
          'Perception timed out or could not connect. No video was retained by this site.',
      },
      502,
    );
  }
};
