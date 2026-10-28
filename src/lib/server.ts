import type { APIContext } from 'astro';
export interface ServerEnv {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  INCEPTION_API_KEY?: string;
  INCEPTION_MODEL?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  BRAIN_API_URL?: string;
  BRAIN_API_TOKEN?: string;
  API_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}
export function environment(context: APIContext): ServerEnv {
  return (context.locals.runtime?.env || {}) as ServerEnv;
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}
export async function protect(context: APIContext, env: ServerEnv) {
  const origin = context.request.headers.get('Origin');
  if (origin !== context.url.origin)
    return json({ error: 'This request must come from the website.' }, 403);
  const ip = context.request.headers.get('CF-Connecting-IP') || 'local';
  if (env.API_LIMITER) {
    for (const key of [`visitor:${ip}`, 'site:all']) {
      const { success } = await env.API_LIMITER.limit({ key });
      if (!success)
        return json(
          {
            error:
              'The demo is busy. Please try again in a minute, or use local search.',
          },
          429,
          { 'Retry-After': '60' },
        );
    }
  } else if (!import.meta.env.DEV)
    return json(
      { error: 'This endpoint is awaiting rate-limit configuration.' },
      503,
    );
  return null;
}
export async function readJSON(
  request: Request,
  maxBytes = 16000,
): Promise<any> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new Error('Send JSON content.');
  if (Number(request.headers.get('Content-Length')) > maxBytes)
    throw new Error('Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is missing.');
  let bytes = 0,
    text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Request is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
