export async function readTokens(
  response: Response,
  onToken: (token: string) => void,
) {
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error('Streaming is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let done = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      pending += decoder.decode(item.value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.text);
        if (event.type === 'token') onToken(event.text);
        if (event.type === 'done') done = true;
      }
    }
    if (!done) throw new Error('The response ended early. Please retry.');
  } finally {
    reader.releaseLock();
  }
}
