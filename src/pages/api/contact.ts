import type { APIRoute } from 'astro';
import { environment, json, protect, readJSON } from '../../lib/server';
import { validateContact } from '../../lib/validation';
export const POST: APIRoute = async (context) => {
  const env = environment(context);
  const denied = await protect(context, env);
  if (denied) return denied;
  let body;
  try {
    body = await readJSON(context.request, 10000);
  } catch {
    return json({ error: 'Invalid or oversized message.' }, 400);
  }
  if (body?.website)
    return json({ error: 'Unable to submit this enquiry.' }, 400);
  if (!validateContact(body))
    return json(
      {
        error:
          'Please enter a name, valid email and a message of 10–5,000 characters.',
      },
      400,
    );
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM)
    return json(
      {
        error:
          'Email delivery is not configured yet. Please use a direct contact link.',
      },
      503,
    );
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: body.email,
        subject: 'Portfolio project enquiry',
        text: `Name: ${body.name}\nEmail: ${body.email}\nProject: ${body.projectType || 'Not specified'}\n\n${body.message}`,
      }),
    });
    if (!response.ok) throw new Error();
    return json({ ok: true });
  } catch {
    return json(
      {
        error:
          'The message could not be delivered. Please try later or use a direct contact link.',
      },
      502,
    );
  }
};
