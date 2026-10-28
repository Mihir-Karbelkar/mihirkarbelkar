import type { APIRoute } from 'astro';
import { environment, json } from '../../lib/server';
import { providers } from '../../lib/providers';
export const GET: APIRoute = (context) => {
  const env = environment(context);
  const limited = !!env.API_LIMITER || import.meta.env.DEV;
  let perceptionURL = false;
  try {
    const url = new URL(env.BRAIN_API_URL || '');
    perceptionURL =
      url.protocol === 'https:' ||
      (import.meta.env.DEV &&
        ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch {}
  return json({
    chat: limited && providers(env).length > 0,
    contact:
      limited && !!(env.RESEND_API_KEY && env.CONTACT_TO && env.CONTACT_FROM),
    perception: limited && perceptionURL && !!env.BRAIN_API_TOKEN,
  });
};
