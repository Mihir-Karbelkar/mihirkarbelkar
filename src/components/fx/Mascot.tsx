import { useEffect, useRef, useState } from 'react';
import {
  carriesFromRight,
  isDeliberateMove,
  mascotOffset,
  targetPoint,
  travelTime,
  type Point,
  type TourStep,
} from '../../lib/tour';
type Pose = 'idle' | 'carry' | 'fly' | 'away';
const cancelled = Symbol('tour cancelled');
/** An original chibi character: plum spiky hair, sakura scarf, lavender gi. */
function Character() {
  return (
    <svg viewBox="0 0 64 72" width="64" height="72" aria-hidden="true">
      <ellipse className="m-shadow" cx="32" cy="69" rx="14" ry="2.6" />
      <path className="m-scarf-tail" d="M24 45c-8 1-13 5-18 3 4-4 9-8 17-9Z" />
      <g className="m-legs">
        <rect x="25" y="56" width="5.5" height="9" rx="2.5" />
        <rect x="33.5" y="56" width="5.5" height="9" rx="2.5" />
      </g>
      <rect className="m-body" x="22" y="40" width="20" height="19" rx="8" />
      <rect className="m-belt" x="22" y="50" width="20" height="3" rx="1.5" />
      <g className="m-arm">
        <path d="M40 45c5-1 9-4 12-8" />
        <circle cx="52.5" cy="36.5" r="3" />
      </g>
      <path className="m-scarf" d="M23 41c6 3 12 3 18 0l-1 4c-5 2-11 2-16 0Z" />
      <circle className="m-skin" cx="32" cy="27" r="14" />
      <path
        className="m-hair"
        d="M17 27c-3-7 0-15 6-18-1-4 2-7 5-8 0 3 2 4 4 4 1-3 4-4 7-3-1 2 0 4 2 5 3-1 6 0 8 2-2 1-2 3-1 5 3 2 4 5 3 9-2-4-5-6-8-6 0 2-1 3-3 4 0-3-2-5-4-6-1 2-3 3-6 3 1-2 0-4-2-5-2 3-6 4-9 3 1 3 0 6-2 7Z"
      />
      <g className="m-eyes">
        <ellipse cx="27" cy="29" rx="2.2" ry="3" />
        <ellipse cx="37.5" cy="29" rx="2.2" ry="3" />
        <circle className="m-glint" cx="27.8" cy="27.8" r=".8" />
        <circle className="m-glint" cx="38.3" cy="27.8" r=".8" />
      </g>
      <circle className="m-cheek" cx="23.5" cy="33.5" r="2" />
      <circle className="m-cheek" cx="41" cy="33.5" r="2" />
      <path className="m-mouth" d="M30.5 35c1 1 2.5 1 3.5 0" />
    </svg>
  );
}
function Cursor() {
  return (
    <svg viewBox="0 0 20 24" width="20" height="24" aria-hidden="true">
      <path
        d="M2 2v17l4.5-4.2 3 6.7 3-1.4-3-6.6H16Z"
        fill="#fff"
        stroke="#1d1824"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function Mascot({ steps }: { steps: TourStep[] }) {
  const [pose, setPose] = useState<Pose>('idle'),
    [pos, setPos] = useState<Point | null>(null),
    [cursor, setCursor] = useState<Point | null>(null),
    [speed, setSpeed] = useState(0),
    [say, setSay] = useState(''),
    [flip, setFlip] = useState(false),
    [flashes, setFlashes] = useState<{ p: Point; k: number }[]>([]),
    [ripple, setRipple] = useState<{ p: Point; k: number } | null>(null);
  const pointer = useRef<Point | null>(null),
    touring = useRef<{ cancelled: boolean } | null>(null),
    home = useRef<HTMLDivElement>(null),
    key = useRef(0);
  useEffect(() => {
    const track = (e: PointerEvent) => {
      if (!touring.current && e.pointerType === 'mouse')
        pointer.current = { x: e.clientX, y: e.clientY };
    };
    addEventListener('pointermove', track, { passive: true });
    const start = () => void tour();
    addEventListener('portfolio:tour', start);
    // "Show me around" from another page lands here as /#tour.
    if (location.hash === '#tour') {
      history.replaceState(null, '', location.pathname);
      setTimeout(start, 600);
    }
    return () => {
      removeEventListener('pointermove', track);
      removeEventListener('portfolio:tour', start);
      if (touring.current) touring.current.cancelled = true;
    };
  }, []);
  const flash = (p: Point) =>
    setFlashes((f) => [...f.slice(-2), { p, k: ++key.current }]);
  async function tour() {
    if (touring.current) return;
    const run = { cancelled: false };
    touring.current = run;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) =>
        setTimeout(() => (run.cancelled ? reject(cancelled) : resolve()), ms),
      );
    const html = document.documentElement;
    const bar = document.querySelector('.chat-bar')?.getBoundingClientRect();
    const start = pointer.current ?? {
      x: bar ? bar.left + bar.width / 2 : innerWidth / 2,
      y: bar ? bar.top : innerHeight - 80,
    };
    const parked = home.current?.getBoundingClientRect();
    const stop = (e: Event) => {
      if (
        e instanceof PointerEvent &&
        e.type === 'pointermove' &&
        !isDeliberateMove(e.movementX, e.movementY)
      )
        return;
      run.cancelled = true;
      finish();
    };
    const events = [
      'pointermove',
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
    ];
    function finish() {
      events.forEach((t) => removeEventListener(t, stop, true));
      html.classList.remove('is-touring');
      setCursor(null);
      setSay('');
      setSpeed(0);
      setPose('away');
      setPos((p) => {
        if (p) flash(p);
        return null;
      });
      setTimeout(() => setPose('idle'), 220);
      touring.current = null;
    }
    // Let the click that started the tour finish before listening for cancels.
    setTimeout(
      () => events.forEach((t) => addEventListener(t, stop, true)),
      300,
    );
    const cursorRef: { current: Point } = { current: start };
    const moveTo = async (to: Point) => {
      const from = cursorRef.current,
        t = reduced ? 0 : travelTime(from, to);
      setFlip(carriesFromRight(to));
      setSpeed(t);
      setPose('fly');
      setCursor(to);
      cursorRef.current = to;
      setPos(mascotOffset(to));
      await wait(t + 40);
      setPose('carry');
    };
    try {
      if (!reduced) {
        html.classList.add('is-touring');
        setCursor(start);
        // Instant transmission: vanish from the corner, appear holding the cursor.
        if (parked) flash({ x: parked.left, y: parked.top });
        setPose('away');
        await wait(200);
        setSpeed(0);
        setFlip(carriesFromRight(start));
        const beside = mascotOffset(start);
        setPos(beside);
        flash(beside);
        setPose('carry');
        await wait(450);
      }
      for (const step of steps) {
        const el = document.querySelector<HTMLElement>(step.target);
        if (!el) continue;
        el.scrollIntoView({
          behavior: reduced ? 'auto' : 'smooth',
          block: 'start',
        });
        await wait(reduced ? 50 : 800);
        const box = (el.querySelector('h2') ?? el).getBoundingClientRect();
        const to = targetPoint(box, { width: innerWidth, height: innerHeight });
        if (!reduced) await moveTo(to);
        setRipple({ p: to, k: ++key.current });
        el.classList.add('is-highlighted');
        setTimeout(() => el.classList.remove('is-highlighted'), 2200);
        setSay(step.say);
        await wait(1800);
        setSay('');
      }
      if (!reduced) await moveTo(start);
      await wait(150);
    } catch (e) {
      if (e !== cancelled) throw e;
      return;
    }
    if (!run.cancelled) finish();
  }
  const style = pos
    ? {
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transitionDuration: `${speed}ms`,
      }
    : undefined;
  return (
    <>
      <div
        ref={home}
        className={`mascot is-${pose}${pos ? ' is-free' : ''}${flip ? ' is-flipped' : ''}`}
        style={style}
        aria-hidden="true"
      >
        <Character />
        {say && <p className="mascot-say">{say}</p>}
      </div>
      {say && (
        <p className="sr-only" role="status">
          {say}
        </p>
      )}
      {cursor && (
        <div
          className="fake-cursor"
          style={{
            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            transitionDuration: `${speed}ms`,
          }}
          aria-hidden="true"
        >
          <Cursor />
        </div>
      )}
      {flashes.map((f) => (
        <span
          key={f.k}
          className="mascot-flash"
          style={{ left: f.p.x + 32, top: f.p.y + 36 }}
          onAnimationEnd={() =>
            setFlashes((all) => all.filter((x) => x.k !== f.k))
          }
          aria-hidden="true"
        />
      ))}
      {ripple && (
        <span
          key={ripple.k}
          className="tour-ripple"
          style={{ left: ripple.p.x, top: ripple.p.y }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
