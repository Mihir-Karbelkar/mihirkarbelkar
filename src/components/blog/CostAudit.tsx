import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  auditMailto,
  auditQuestions,
  openItems,
  type Answer,
} from '../../lib/costAudit';

const choices: { value: Answer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Don’t know' },
];
/** The docked button: sends the answers by email. */
const SEND = 'Send me your answers';
/** The floating button: takes the reader to the questions. */
const FIND = 'Find your AI cost leaks';

/**
 * The interactive audit. Its email button floats at the bottom of the screen
 * while the reader is elsewhere in the post, and glides into its place here
 * when this section scrolls into view (and back out when they move on).
 */
export default function CostAudit() {
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() =>
    auditQuestions.map(() => undefined),
  );
  const answered = answers.filter(Boolean).length;
  const open = openItems(answers);
  const href = auditMailto(answers);

  const dock = useRef<HTMLAnchorElement>(null);
  const float = useRef<HTMLAnchorElement>(null);
  const [mounted, setMounted] = useState(false);
  const [docked, setDocked] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pastIntro, setPastIntro] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setPastIntro(scrollY > 480);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    const el = dock.current;
    let io: IntersectionObserver | undefined;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => setDocked(e.isIntersecting), {
        rootMargin: '0px 0px -12% 0px',
      });
      io.observe(el);
    }
    return () => {
      removeEventListener('scroll', onScroll);
      io?.disconnect();
    };
  }, []);

  // Glide between the floating spot and the docked spot (FLIP).
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const f = float.current;
    const d = dock.current;
    if (!f || !d || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    // Re-measure every frame: the page may still be (smooth-)scrolling, so the
    // docked spot keeps moving while the button travels to it.
    setMoving(true);
    const start = performance.now();
    const DURATION = 450;
    const ease = (t: number) => 1 - (1 - t) ** 3;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const k = docked ? ease(t) : 1 - ease(t);
      f.style.transform = 'none';
      const fr = f.getBoundingClientRect();
      const dr = d.getBoundingClientRect();
      f.style.transform = `translate(${(dr.left - fr.left) * k}px, ${(dr.top - fr.top) * k}px)`;
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        f.style.transform = '';
        setMoving(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      f.style.transform = '';
    };
  }, [docked]);

  const floatShown = (!docked || moving) && (pastIntro || moving);
  const dockShown = docked && !moving;

  const pick = (i: number, a: Answer) =>
    setAnswers((s) =>
      s.map((v, k) => (k === i ? (v === a ? undefined : a) : v)),
    );

  return (
    <div className="cost-audit" id="cost-audit">
      <ol className="audit-list">
        {auditQuestions.map((q, i) => (
          <li key={q} className="audit-item">
            <span className="audit-q">{q}</span>
            <span className="audit-choices" role="group" aria-label={q}>
              {choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`audit-choice is-${c.value}`}
                  aria-pressed={answers[i] === c.value}
                  onClick={() => pick(i, c.value)}
                >
                  {c.label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>

      <div className="audit-result" aria-live="polite">
        <p>
          {answered === 0
            ? 'Tap an answer for each question.'
            : open === 0 && answered === auditQuestions.length
              ? 'All seven are yes. Your model spend is under control.'
              : `${open} likely saving${open === 1 ? '' : 's'} so far, from ${answered} of ${auditQuestions.length} answered.`}
        </p>
        <p className="audit-note">
          The button below opens an email to me with your answers already in it.
          Add a line about your product and send it.
        </p>
        <a
          ref={dock}
          className="button primary audit-cta"
          href={href}
          style={{ visibility: dockShown ? 'visible' : 'hidden' }}
          aria-hidden={!dockShown}
          tabIndex={dockShown ? 0 : -1}
        >
          {SEND} <span aria-hidden="true">→</span>
        </a>
      </div>

      {mounted &&
        createPortal(
          <a
            ref={float}
            className={`button primary audit-cta audit-float${floatShown ? ' is-shown' : ''}`}
            href="#cost-audit"
            onClick={(e) => {
              e.preventDefault();
              const box = document.getElementById('cost-audit');
              box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              box
                ?.querySelector<HTMLButtonElement>('.audit-choice')
                ?.focus({ preventScroll: true });
            }}
            aria-hidden={!floatShown}
            tabIndex={floatShown ? 0 : -1}
          >
            {FIND} <span aria-hidden="true">↓</span>
          </a>,
          document.body,
        )}
    </div>
  );
}
