import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Icon from '../ui/Icon';
import ModelPicker from './ModelPicker';
import { models } from '../../lib/browser-models';
import { generate, stopModel } from '../../lib/local-engine';
import { search } from '../../lib/vector-store';
import { systemPrompt, type Source } from '../../lib/prompt';
import { routeIntent, type IntentContext } from '../../lib/intent';
import { readTokens } from '../../lib/client-stream';
import { errorMessage } from '../../lib/errors';
import { TIERS } from '../../lib/models';
import type { ChatMessage } from '../../lib/contracts';
/** Hosted Groq/Inception answers are used only on devices without WebGPU, and only if configured. */
const HOSTED_FALLBACK = true;
type Via = 'local' | 'hosted' | 'search';
type Message = ChatMessage & { sources?: Source[]; via?: Via; model?: string };
export interface ChatBarProps extends IntentContext {
  greeting: string;
  placeholder: string;
  suggestions: string[];
}
const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Scrolls to an element on this page and highlights it, or navigates to its page. */
export function goTo(target: string, href: string) {
  const el = document.querySelector<HTMLElement>(target);
  if (!el) return void (location.href = href);
  el.scrollIntoView({
    behavior: reducedMotion() ? 'auto' : 'smooth',
    block: 'center',
  });
  el.classList.remove('is-highlighted');
  void el.offsetWidth;
  el.classList.add('is-highlighted');
  setTimeout(() => el.classList.remove('is-highlighted'), 2200);
}
export default function ChatBar(props: ChatBarProps) {
  const manager = models();
  const m = useSyncExternalStore(
    manager.subscribe,
    manager.getState,
    manager.getState,
  );
  const [expanded, setExpanded] = useState(true),
    [panel, setPanel] = useState(false),
    [query, setQuery] = useState(''),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [toast, setToast] = useState(''),
    [hosted, setHosted] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    panelRef = useRef<HTMLDivElement>(null),
    log = useRef<HTMLDivElement>(null),
    abort = useRef<AbortController | null>(null),
    run = useRef(0),
    focused = useRef(false);
  useEffect(() => {
    void manager.init();
    if (HOSTED_FALLBACK)
      fetch('/api/config')
        .then((r) => r.json() as Promise<{ chat: boolean }>)
        .then((c) => setHosted(c.chat))
        .catch(() => {});
    document.documentElement.classList.add('has-chat');
  }, []);
  // Starts open; collapses to a pill once the visitor scrolls into the page.
  useEffect(() => {
    let last = scrollY;
    const onScroll = () => {
      if (panel || focused.current) return;
      if (scrollY < 80) setExpanded(true);
      else if (scrollY > last + 4 && scrollY > 160) setExpanded(false);
      last = scrollY;
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, [panel]);
  // "/" focuses the bar from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      setExpanded(true);
      requestAnimationFrame(() => input.current?.focus());
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  // The answer panel is modal: lock page scroll, trap focus, Escape closes.
  useEffect(() => {
    if (!panel) return;
    const html = document.documentElement;
    html.classList.add('chat-locked');
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab' && panelRef.current) {
        const f = [
          ...panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], textarea, [tabindex="0"]',
          ),
        ];
        const first = f[0],
          lastEl = f.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      html.classList.remove('chat-locked');
      removeEventListener('keydown', onKey);
    };
  }, [panel]);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const close = useCallback(() => {
    setPanel(false);
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const stop = () => {
    run.current++;
    abort.current?.abort();
    if (m.active) stopModel(manager.model(m.active));
    setBusy(false);
    setStatus('');
  };
  async function send(text = query) {
    const q = text.trim().slice(0, 1500);
    if (!q || busy) return;
    setQuery('');
    const intent = routeIntent(q, props);
    if (intent.kind === 'navigate') {
      setPanel(false);
      setToast(`Here’s ${intent.label}.`);
      goTo(intent.target, intent.href);
      return;
    }
    if (intent.kind === 'tour') {
      setPanel(false);
      setExpanded(false);
      dispatchEvent(new CustomEvent('portfolio:tour'));
      return;
    }
    const current = ++run.current,
      history = messages.filter((x) => x.content).slice(-4);
    const reply: Message = { role: 'assistant', content: '' };
    const update = () => {
      if (current === run.current)
        setMessages([...history, { role: 'user', content: q }, { ...reply }]);
    };
    setPanel(true);
    setBusy(true);
    update();
    try {
      setStatus('Searching the site…');
      const found = await search(
        q,
        (t) => current === run.current && setStatus(t),
      );
      if (current !== run.current) return;
      reply.sources = found.sources;
      const active = manager.getState().active;
      const useHosted =
        !active &&
        HOSTED_FALLBACK &&
        hosted &&
        !manager.getState().capability?.webgpu;
      if (!found.sources.length) {
        reply.via = 'search';
        reply.content =
          'I couldn’t find that in anything published here. Try asking about a project, or say hello in the contact section.';
      } else if (active) {
        reply.via = 'local';
        reply.model = TIERS.find((t) => t.id === active)!.label;
        setStatus(`Thinking on this device (${reply.model})…`);
        await generate(
          manager.model(active),
          [
            { role: 'system', content: systemPrompt(found.sources) },
            ...history.map(({ role, content }) => ({ role, content })),
            { role: 'user', content: q },
          ],
          (token) => {
            reply.content += token;
            update();
          },
          320,
        );
      } else if (useHosted) {
        reply.via = 'hosted';
        setStatus('Asking the hosted model…');
        abort.current = new AbortController();
        const res = await fetch('/api/chat', {
          method: 'POST',
          signal: abort.current.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: q }].map(
              ({ role, content }) => ({ role, content }),
            ),
          }),
        });
        await readTokens(res, (token) => {
          reply.content += token;
          update();
        });
      } else {
        reply.via = 'search';
        reply.content =
          m.tiers[m.preferred ?? 'qwen-0.5b']?.status === 'loading'
            ? 'The on-device model is still downloading, so here’s what I found so far:'
            : 'Here’s what I found:';
      }
      update();
    } catch (e) {
      if (current !== run.current) return;
      reply.content ||= errorMessage(
        e,
        'Something went wrong. Please try again.',
      );
      update();
    } finally {
      if (current === run.current) {
        setBusy(false);
        setStatus('');
      }
    }
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  const loading = TIERS.map((t) => ({ t, s: m.tiers[t.id] })).find(
    (x) => x.s.status === 'loading',
  );
  return (
    <>
      {panel && (
        <div className="chat-scrim" onClick={close} aria-hidden="true" />
      )}
      <div className={`chat-dock${expanded || panel ? ' is-open' : ''}`}>
        {panel && (
          <div
            className="chat-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chat answers"
            ref={panelRef}
          >
            <div className="chat-panel-head">
              <span className="chat-title">
                <Icon name="sparkle" /> Ask the portfolio
              </span>
              <button
                className="chat-icon"
                type="button"
                onClick={close}
                aria-label="Close answers"
              >
                <Icon name="close" />
              </button>
            </div>
            <div
              className="chat-log"
              ref={log}
              aria-live="polite"
              aria-busy={busy}
            >
              {messages.map((x, i) => (
                <div key={i} className={`chat-msg is-${x.role}`}>
                  {x.role === 'assistant' && (
                    <span className="chat-avatar" aria-hidden="true">
                      <Icon name="sparkle" />
                    </span>
                  )}
                  <div className="chat-bubble">
                    {x.content ? (
                      x.content
                        .split(/\n{2,}/)
                        .map((p, j) => <p key={j}>{p}</p>)
                    ) : (
                      <span className="chat-typing" aria-label="Thinking">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {x.via === 'search' && !!x.sources?.length && (
                      <div className="chat-results">
                        {x.sources.map((s) => (
                          <a key={s.id} className="chat-result" href={s.href}>
                            <strong>{s.title}</strong>
                            <span>{s.text.slice(0, 180)}…</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {x.via !== 'search' && !!x.sources?.length && (
                      <div className="chat-sources">
                        {x.sources.map((s) => (
                          <a key={s.id} href={s.href}>
                            {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                    {x.via && x.via !== 'search' && x.content && (
                      <small className="chat-via">
                        {x.via === 'local'
                          ? `Generated in your browser · ${x.model}`
                          : 'Generated by a hosted model'}
                        . Check the sources.
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {toast && (
          <p className="chat-toast" role="status">
            {toast}
          </p>
        )}
        <div className="chat-shell">
          <form
            className="chat-bar"
            onSubmit={onSubmit}
            aria-label="Ask about Mihir’s work"
          >
            <button
              type="button"
              className="chat-orb"
              aria-label={expanded ? 'Ask a question' : 'Open the chat'}
              onClick={() => {
                setExpanded(true);
                requestAnimationFrame(() => input.current?.focus());
              }}
            >
              <Icon name="sparkle" />
            </button>
            <label className="sr-only" htmlFor="chat-input">
              Ask a question
            </label>
            <textarea
              id="chat-input"
              ref={input}
              rows={1}
              value={query}
              maxLength={1500}
              placeholder={props.placeholder}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                focused.current = true;
                setExpanded(true);
              }}
              onBlur={() => (focused.current = false)}
            />
            {busy ? (
              <button
                type="button"
                className="chat-send"
                onClick={stop}
                aria-label="Stop"
              >
                <Icon name="stop" />
              </button>
            ) : (
              <button
                type="submit"
                className="chat-send"
                disabled={!query.trim()}
                aria-label="Send"
              >
                <Icon name="send" />
              </button>
            )}
          </form>
          <div className="chat-extras">
            {status ? (
              <p className="chat-status" role="status">
                {status}
              </p>
            ) : (
              !panel && (
                <div className="chat-suggestions">
                  {messages.length === 0 && (
                    <p className="chat-greeting">{props.greeting}</p>
                  )}
                  <div className="chat-chips">
                    {props.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            <ModelPicker state={m} manager={manager} loading={loading} />
          </div>
        </div>
      </div>
    </>
  );
}
