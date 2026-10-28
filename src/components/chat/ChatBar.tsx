import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import Icon from '../ui/Icon';
import AssistantStatus from './AssistantStatus';
import ModelPicker from './ModelPicker';
import { assistantDebug, models } from '../../lib/browser-models';
import {
  keywordSearch,
  routeAction,
  routerWarm,
  search,
  warmUp,
} from '../../lib/vector-store';
import { applyTheme } from '../../lib/theme';
import { buildExemplars, type ActionSpec } from '../../lib/router';
import type { Source } from '../../lib/prompt';
import { routeIntent, type Intent, type IntentContext } from '../../lib/intent';
import { friendlyError } from '../../lib/errors';
import { TIERS, type TierId } from '../../lib/models';
import type { ChatMessage } from '../../lib/contracts';
import { runChat, type ChatCopy } from '../../lib/chat/pipeline';
import {
  bestExcerpt,
  finalizeAnswer,
  type Segment,
} from '../../lib/chat/answer';
import { hostedEngine, localEngine } from '../../lib/chat/engines';
/** Hosted Groq/Inception answers are used only on devices without WebGPU, and only if configured. */
const HOSTED_FALLBACK = true;
type Turn =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      /** Plain text kept for conversation history. */
      content: string;
      state: 'pending' | 'writing' | 'answer' | 'cards';
      segments?: Segment[];
      sources?: Source[];
      query?: string;
      empty?: boolean;
    };
export interface ChatBarProps extends IntentContext {
  greeting: string;
  placeholder: string;
  suggestions: string[];
  actions: ActionSpec[];
  copy: ChatCopy & {
    contactLabel: string;
    answeredFrom: string;
    enable: string;
    preparing: string;
  };
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
  const exemplars = useMemo(
    () => buildExemplars(props.actions),
    [props.actions],
  );
  const m = useSyncExternalStore(
    manager.subscribe,
    manager.getState,
    manager.getState,
  );
  const [expanded, setExpanded] = useState(true),
    [panel, setPanel] = useState(false),
    [query, setQuery] = useState(''),
    [turns, setTurns] = useState<Turn[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [toast, setToast] = useState(''),
    [hosted, setHosted] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    panelRef = useRef<HTMLDivElement>(null),
    log = useRef<HTMLDivElement>(null),
    abort = useRef<AbortController | null>(null),
    warmed = useRef(false),
    debug = useMemo(() => assistantDebug(), []),
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
  }, [turns]);
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
    setBusy(false);
    setStatus('');
    setTurns((t) =>
      t.filter((x) => x.role === 'user' || x.state !== 'pending'),
    );
  };
  /** Loads the search model and embeds the index on first interaction, not on page load. */
  const warm = () => {
    if (warmed.current) return;
    warmed.current = true;
    void warmUp(exemplars);
  };
  /** Performs navigation, tours and site actions; false means "answer it". */
  function act(intent: Intent): boolean {
    const say = (id: string) =>
      props.actions.find((a) => a.id === id)?.reply ?? '';
    if (intent.kind === 'navigate') {
      setPanel(false);
      setToast(`Here’s ${intent.label}.`);
      goTo(intent.target, intent.href);
    } else if (intent.kind === 'tour') {
      setPanel(false);
      setExpanded(false);
      if (document.querySelector('.mascot'))
        dispatchEvent(new CustomEvent('portfolio:tour'));
      else location.href = '/#tour';
    } else if (intent.kind === 'action') {
      setPanel(false);
      if (intent.action === 'top')
        scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      else applyTheme(intent.action === 'theme-dark' ? 'dark' : 'light');
      setToast(say(intent.action));
    } else return false;
    return true;
  }
  async function send(text = query) {
    const q = text.trim().slice(0, 1500);
    if (!q || busy) return;
    setQuery('');
    warm();
    const current = ++run.current;
    const history: ChatMessage[] = turns
      .filter((t) => t.content && (t.role === 'user' || t.state !== 'pending'))
      .slice(-4)
      .map(({ role, content }) => ({ role, content }));
    const base = turns.filter(
      (t) => t.role === 'user' || t.state !== 'pending',
    );
    const show = (reply: Turn) => {
      if (current === run.current)
        setTurns([...base, { role: 'user', content: q }, reply]);
    };
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      setPanel(true);
      show({ role: 'assistant', content: '', state: 'pending' });
    };
    try {
      const outcome = await runChat(
        q,
        history,
        {
          rules: (x) => routeIntent(x, props),
          route: (x) => routeAction(x, exemplars),
          routerWarm,
          search: (x) => search(x),
          keywordSearch: (x) => keywordSearch(x),
          engine: () => {
            const state = manager.getState();
            return (
              localEngine(manager) ??
              (HOSTED_FALLBACK && hosted && !state.capability?.webgpu
                ? hostedEngine()
                : null)
            );
          },
          onGpuLost: (id) => manager.lost(id as TierId),
          copy: props.copy,
        },
        (p) => {
          if (current !== run.current) return;
          open();
          if (p.stage === 'writing')
            show({
              role: 'assistant',
              content: '',
              state: 'writing',
              segments: finalizeAnswer(p.partial, p.sources),
              sources: p.sources,
            });
        },
        controller.signal,
      );
      if (current !== run.current) return;
      if (outcome.kind === 'intent') {
        act(outcome.intent);
        return;
      }
      open();
      if (outcome.kind === 'answer')
        show({
          role: 'assistant',
          content: outcome.text,
          state: 'answer',
          segments: outcome.segments,
          sources: outcome.sources,
        });
      else
        show({
          role: 'assistant',
          content: outcome.intro,
          state: 'cards',
          sources: outcome.sources,
          query: q,
          empty: outcome.reason === 'empty',
        });
    } catch (e) {
      if (current !== run.current || controller.signal.aborted) return;
      open();
      show({
        role: 'assistant',
        content: friendlyError(e),
        state: 'cards',
        sources: [],
      });
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
              {turns.map((x, i) =>
                x.role === 'user' ? (
                  <div key={i} className="chat-msg is-user">
                    <div className="chat-bubble">
                      <p>{x.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="chat-msg is-assistant">
                    <span className="chat-avatar" aria-hidden="true">
                      <Icon name="sparkle" />
                    </span>
                    <div className="chat-bubble">
                      {x.state === 'pending' ? (
                        <span className="chat-typing" aria-label="Thinking">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : x.segments ? (
                        <p
                          className={x.state === 'writing' ? 'is-writing' : ''}
                        >
                          {x.segments.map((seg, j) =>
                            seg.cite ? (
                              <a
                                key={j}
                                className="chat-cite"
                                href={seg.href}
                                aria-label={`Source ${seg.cite}: ${x.sources?.[seg.cite - 1]?.title ?? ''}`}
                              >
                                {seg.cite}
                              </a>
                            ) : seg.href ? (
                              <a key={j} href={seg.href}>
                                {seg.text}
                              </a>
                            ) : (
                              <span key={j}>{seg.text}</span>
                            ),
                          )}
                        </p>
                      ) : (
                        <p>
                          {x.content}
                          {x.empty && (
                            <>
                              {' '}
                              <a href="/#contact">{props.copy.contactLabel}</a>
                            </>
                          )}
                        </p>
                      )}
                      {x.state === 'cards' && !!x.sources?.length && (
                        <div className="chat-results">
                          {x.sources.map((src) => (
                            <a
                              key={src.id}
                              className="chat-result"
                              href={src.href}
                            >
                              <strong>{src.title}</strong>
                              <span>{bestExcerpt(src, x.query ?? '')}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {x.state === 'answer' && !!x.sources?.length && (
                        <>
                          <div className="chat-sources">
                            {x.sources.map((src, j) => (
                              <a key={src.id} href={src.href}>
                                <span className="chat-cite" aria-hidden="true">
                                  {j + 1}
                                </span>
                                {src.title}
                              </a>
                            ))}
                          </div>
                          <small className="chat-via">
                            {props.copy.answeredFrom}
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                ),
              )}
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
                warm();
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
                  {turns.length === 0 && (
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
            {debug ? (
              <ModelPicker state={m} manager={manager} loading={loading} />
            ) : (
              <AssistantStatus state={m} manager={manager} copy={props.copy} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
