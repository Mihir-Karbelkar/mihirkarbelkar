import Icon from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../ui/button';
import { searchContent, systemPrompt } from '../../lib/content';
import type { Source } from '../../lib/content';
import type { ChatMessage } from '../../lib/contracts';
import { errorMessage } from '../../lib/errors';
import { readTokens } from '../../lib/client-stream';
import {
  cancelLocal,
  clearLocalCache,
  generateLocal,
  loadLocal,
  stopLocal,
} from '../../lib/local-engine';
type Mode = 'search' | 'local' | 'hosted';
type Message = ChatMessage & { sources?: Source[]; mode?: Mode };
export default function Assistant() {
  const [mode, setMode] = useState<Mode>('search'),
    [query, setQuery] = useState(''),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState(''),
    [hosted, setHosted] = useState(false);
  const abort = useRef<AbortController | null>(null),
    content = useRef<HTMLDivElement>(null),
    run = useRef(0);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json() as Promise<{ chat: boolean; contact: boolean }>)
      .then((c) => setHosted(c.chat))
      .catch(() => {});
    return () => {
      abort.current?.abort();
      cancelLocal();
    };
  }, []);
  useEffect(() => {
    const el = content.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 180)
      el.scrollTop = el.scrollHeight;
  }, [messages]);
  async function load() {
    setError('');
    setLoading(true);
    try {
      await loadLocal((t, v) => {
        setStatus(t);
        setProgress(v);
      });
      setReady(true);
      setStatus('Ready. Inference runs on this device.');
    } catch (e) {
      setError(
        errorMessage(
          e,
          'Model loading failed. Try a current browser with WebGPU enabled.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  function stop() {
    run.current++;
    abort.current?.abort();
    stopLocal();
    setBusy(false);
  }
  async function send(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setQuery('');
    setError('');
    const refs = searchContent(text);
    const history = [...messages, { role: 'user' as const, content: text }];
    const reply: Message = {
      role: 'assistant',
      content: '',
      sources: refs,
      mode,
    };
    setMessages([...history, reply]);
    if (mode === 'search') {
      reply.content = refs.length
        ? 'Here are the closest matches in Mihir’s published work. Open a source to explore the full context.'
        : 'That information is not published here. Try “SQL agents”, “robot fleet”, “RAG”, “services” or contact Mihir.';
      setMessages([...history, { ...reply }]);
      return;
    }
    if (mode === 'local' && !ready) {
      setError('Load the on-device model before sending, or use Search.');
      setMessages(history);
      return;
    }
    if (!refs.length) {
      reply.content =
        'I couldn’t find published information supporting an answer. Please contact Mihir for the details.';
      setMessages([...history, { ...reply }]);
      return;
    }
    setBusy(true);
    const id = ++run.current;
    const update = (token: string) => {
      if (id !== run.current) return;
      reply.content += token;
      setMessages([...history, { ...reply }]);
    };
    try {
      if (mode === 'local') {
        await generateLocal(
          [
            { role: 'system', content: systemPrompt(refs) },
            { role: 'user', content: text },
          ],
          update,
        );
      } else {
        abort.current = new AbortController();
        const res = await fetch('/api/chat', {
          method: 'POST',
          signal: abort.current.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history
              .slice(-6)
              .map(({ role, content }) => ({ role, content })),
          }),
        });
        await readTokens(res, update);
      }
    } catch (e) {
      if (id === run.current) {
        setError(errorMessage(e, 'Chat is unavailable.'));
        if (!reply.content) {
          reply.content =
            'Generation is unavailable. You can still explore the matching sources below or switch to Search.';
          setMessages([...history, { ...reply }]);
        }
      }
    } finally {
      if (id === run.current) setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void send(query);
  }
  return (
    <div className="assistant">
      <div className="assistant-top">
        <div className="assistant-title">
          <span>✳</span>
          <div>
            <strong>The portfolio guide</strong>
            <small>Grounded in published work. Curious by nature.</small>
          </div>
        </div>
        <div className="mode-tabs" aria-label="Inference mode">
          {(['search', 'local', 'hosted'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={busy || loading}
              onClick={() => {
                setMode(m);
                setError('');
              }}
            >
              {m === 'search'
                ? 'Search'
                : m === 'local'
                  ? 'On this device'
                  : 'Hosted'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'local' && (
        <div className="engine-controls">
          <p>
            Qwen2.5 0.5B · quantized. Approximately 400 MB of weights plus
            runtime assets; memory use is higher. Download only when you choose
            Load. First use needs a network connection; browser cache may be
            evicted.
          </p>
          <div className="engine-actions">
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              disabled={ready || loading}
            >
              {ready
                ? 'Model ready'
                : loading
                  ? 'Loading…'
                  : 'Load on-device model'}
            </Button>
            {loading && (
              <>
                <progress
                  max={1}
                  value={progress}
                  aria-label="Model download progress"
                />
                <button
                  className="plain-button"
                  onClick={() => {
                    cancelLocal();
                    setLoading(false);
                    setStatus('Loading cancelled.');
                  }}
                >
                  Cancel
                </button>
              </>
            )}
            <button
              className="plain-button"
              disabled={busy || loading}
              onClick={async () => {
                try {
                  await clearLocalCache();
                  setReady(false);
                  setStatus('Model cache cleared.');
                } catch {
                  setError(
                    'Unable to clear the model cache. Try your browser storage settings.',
                  );
                }
              }}
            >
              Clear model cache
            </button>
          </div>
          <p role="status">{status}</p>
        </div>
      )}
      {mode === 'hosted' && (
        <div className="engine-controls">
          <p>
            {hosted
              ? 'Hosted mode sends your message and relevant public portfolio context to a configured inference provider. No conversation is saved by this site; provider retention policies apply.'
              : 'Hosted inference is not configured. Search is available immediately; local inference is optional on supported devices.'}
          </p>
        </div>
      )}
      <div className="chat-content" ref={content}>
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <h3>What would you like to explore?</h3>
            <p>
              Ask about a project, a technology, or how I can help. Search works
              instantly, without an AI download.
            </p>
            <div className="suggestions">
              {[
                'Show me the SQL agent work',
                'How did the robot fleet scale?',
                'What can you help me build?',
              ].map((s) => (
                <button key={s} onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <span className="message-role">
                {m.role === 'user'
                  ? 'YOU'
                  : m.mode === 'search'
                    ? 'PORTFOLIO SEARCH'
                    : 'PORTFOLIO GUIDE'}
              </span>
              <p>{m.content || 'Thinking…'}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="source-links">
                  {m.sources.map((s) => (
                    <a key={s.id} href={s.href}>
                      {s.title}
                      <Icon name="right" />
                    </a>
                  ))}
                </div>
              )}
              {m.mode === 'search' &&
                m.sources?.map((s) => (
                  <div className="source-result" key={s.id}>
                    <h4>
                      <a href={s.href}>
                        {s.title}
                        <Icon name="right" />
                      </a>
                    </h4>
                    <p>{s.text.slice(0, 240)}…</p>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
      <form className="chat-compose" onSubmit={submit}>
        <label>
          <span className="sr-only">Ask about Mihir’s work</span>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send(query);
              }
            }}
            rows={1}
            maxLength={1500}
            placeholder="Ask about my work…"
            disabled={busy}
          />
        </label>
        {busy ? (
          <Button type="button" variant="outline" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={
              !query.trim() ||
              (mode === 'hosted' && !hosted) ||
              (mode === 'local' && !ready)
            }
          >
            Send <Icon name="send" />
          </Button>
        )}
      </form>
      <div className="assistant-foot">
        <span role="status" className={error ? 'error' : ''}>
          {error ||
            'Session-only conversation · always check the linked sources'}
        </span>
        <button
          className="plain-button"
          disabled={busy}
          onClick={() => {
            setMessages([]);
            setError('');
          }}
        >
          Clear chat
        </button>
      </div>
    </div>
  );
}
