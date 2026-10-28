import type { ServerEnv } from './server';
import type { ChatMessage } from './contracts';
export interface Provider {
  name: string;
  url: string;
  key: string;
  model: string;
}
export function providers(env: ServerEnv): Provider[] {
  const list: Provider[] = [];
  if (env.GROQ_API_KEY && env.GROQ_MODEL)
    list.push({
      name: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
    });
  if (env.INCEPTION_API_KEY && env.INCEPTION_MODEL)
    list.push({
      name: 'Inception',
      url: 'https://api.inceptionlabs.ai/v1/chat/completions',
      key: env.INCEPTION_API_KEY,
      model: env.INCEPTION_MODEL,
    });
  return list;
}
const cooldown = new Map<string, number>();
export function retryDelay(header: string | null, now = Date.now()) {
  if (!header) return 60000;
  const seconds = Number(header);
  return Number.isFinite(seconds)
    ? Math.max(1000, seconds * 1000)
    : Math.max(1000, Date.parse(header) - now) || 60000;
}
export async function infer(
  env: ServerEnv,
  messages: ({ role: 'system'; content: string } | ChatMessage)[],
  signal: AbortSignal,
): Promise<Response> {
  const configured = providers(env);
  if (!configured.length)
    throw new Error(
      'Hosted inference is not configured. Use Search or On this device.',
    );
  for (const provider of configured) {
    if ((cooldown.get(provider.name) || 0) > Date.now()) continue;
    let response: Response;
    try {
      response = await fetch(provider.url, {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        headers: {
          Authorization: `Bearer ${provider.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: true,
          max_tokens: 384,
          temperature: 0.3,
        }),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      continue;
    }
    if (response.ok && response.body) return streamTokens(response, signal);
    if (response.status === 429 || response.status >= 500) {
      cooldown.set(
        provider.name,
        Date.now() + retryDelay(response.headers.get('Retry-After')),
      );
      await response.body?.cancel();
      continue;
    }
    await response.body?.cancel();
  }
  throw new Error(
    'Hosted providers are unavailable or at capacity. Try Search or On this device, or come back later.',
  );
}
function streamTokens(upstream: Response, signal: AbortSignal) {
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const body = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      const decoder = new TextDecoder();
      let pending = '',
        completed = false;
      let count = 0;
      try {
        reader = upstream.body!.getReader();
        while (true) {
          if (signal.aborted) throw new Error('Request stopped.');
          const item = await reader.read();
          if (item.done) break;
          pending += decoder.decode(item.value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              completed = true;
              break;
            }
            if (!data) continue;
            const event = JSON.parse(data);
            if (event.error) throw new Error('Provider generation failed.');
            const text = event.choices?.[0]?.delta?.content;
            if (typeof text === 'string') {
              count += text.length;
              if (count > 12000) throw new Error('Response limit reached.');
              emit({ type: 'token', text });
            }
            if (event.choices?.[0]?.finish_reason) completed = true;
          }
          if (completed) break;
        }
        if (!completed) throw new Error('Provider stream ended early.');
        emit({ type: 'done' });
      } catch {
        emit({
          type: 'error',
          text: 'Generation was interrupted. Please retry or use Search.',
        });
      } finally {
        await reader?.cancel().catch(() => {});
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      void reader?.cancel();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
