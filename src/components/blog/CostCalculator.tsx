import { useEffect, useMemo, useRef, useState } from 'react';
import {
  breakEvenRequestsPerDay,
  exampleInputs,
  monthlyCost,
  type CostInputs,
} from '../../lib/inferenceCost';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactMoney = (n: number) =>
  n >= 1e6
    ? `$${+(n / 1e6).toFixed(1)}M`
    : n >= 1e3
      ? `$${+(n / 1e3).toFixed(1)}k`
      : `$${Math.round(n)}`;
const compactCount = (n: number) =>
  n >= 1e6
    ? `${+(n / 1e6).toFixed(1)}M`
    : n >= 1e3
      ? `${+(n / 1e3).toFixed(1)}k`
      : `${Math.round(n)}`;

/** A round number at or above n (1, 2, 2.5, 5 × 10^k). */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

type Field = {
  key: keyof CostInputs;
  label: string;
  step: number;
  min?: number;
  max?: number;
};
const advanced: Field[] = [
  { key: 'inputTokens', label: 'Tokens sent per request', step: 100, min: 0 },
  {
    key: 'outputTokens',
    label: 'Tokens returned per request',
    step: 50,
    min: 0,
  },
  {
    key: 'apiInputPrice',
    label: 'API price per million tokens sent ($)',
    step: 0.1,
    min: 0,
  },
  {
    key: 'apiOutputPrice',
    label: 'API price per million tokens returned ($)',
    step: 0.5,
    min: 0,
  },
  {
    key: 'gpuHourly',
    label: 'Rent for one GPU, per hour ($)',
    step: 0.1,
    min: 0,
  },
  {
    key: 'gpuRequestsPerSecond',
    label: 'Requests per second one GPU handles',
    step: 0.5,
    min: 0.1,
  },
  {
    key: 'peakFactor',
    label: 'Busiest hour vs an average hour (×)',
    step: 0.5,
    min: 1,
  },
];

const W_MIN = 280;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 52 };
const N = 160;

export default function CostCalculator() {
  const [inputs, setInputs] = useState<CostInputs>(exampleInputs);
  const set = (key: keyof CostInputs, value: number) =>
    setInputs((s) => ({ ...s, [key]: Number.isFinite(value) ? value : 0 }));

  const result = monthlyCost(inputs);
  const breakEven = useMemo(() => breakEvenRequestsPerDay(inputs), [inputs]);

  // Chart width follows the container so text stays readable on phones.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(W_MIN, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xMax = niceCeil(
    Math.max(inputs.requestsPerDay * 2, (breakEven ?? 0) * 2, 1000),
  );
  const series = useMemo(() => {
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const x = (xMax * k) / N;
      const r = monthlyCost({ ...inputs, requestsPerDay: x });
      pts.push({ x, before: r.before, after: r.after });
    }
    return pts;
  }, [inputs, xMax]);
  const yMax = niceCeil(
    Math.max(1, ...series.map((p) => Math.max(p.before, p.after))),
  );

  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + (x / xMax) * iw;
  const sy = (y: number) => PAD.top + ih - (y / yMax) * ih;
  const path = (key: 'before' | 'after') =>
    series
      .map(
        (p, k) =>
          `${k ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p[key]).toFixed(1)}`,
      )
      .join('');
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);

  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const k = Math.round(((px - PAD.left) / iw) * N);
    setHover(k >= 0 && k <= N ? k : null);
  };
  const hp = hover === null ? null : series[hover];

  const cur = series.reduce((best, p) =>
    Math.abs(p.x - inputs.requestsPerDay) <
    Math.abs(best.x - inputs.requestsPerDay)
      ? p
      : best,
  );
  const tableVolumes = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

  return (
    <figure className="cost-calc" aria-labelledby="cost-calc-title">
      <figcaption id="cost-calc-title" className="cost-calc-title">
        Before and after: an estimate with your numbers
      </figcaption>

      <div className="cost-calc-inputs">
        <label className="cost-field">
          <span>Model requests per day</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={inputs.requestsPerDay}
            onChange={(e) => set('requestsPerDay', e.target.valueAsNumber)}
          />
        </label>
        <label className="cost-field">
          <span>
            Share a small model could take:{' '}
            <strong>{Math.round(inputs.movableShare * 100)}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(inputs.movableShare * 100)}
            onChange={(e) => set('movableShare', e.target.valueAsNumber / 100)}
          />
        </label>
      </div>

      <details className="cost-calc-advanced">
        <summary>Prices and assumptions</summary>
        <div className="cost-calc-inputs">
          {advanced.map((f) => (
            <label className="cost-field" key={f.key}>
              <span>{f.label}</span>
              <input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={inputs[f.key]}
                onChange={(e) => set(f.key, e.target.valueAsNumber)}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="button secondary small"
          onClick={() => setInputs(exampleInputs)}
        >
          Reset to the example
        </button>
      </details>

      <div className="cost-calc-results" aria-live="polite">
        <div className="cost-stat">
          <span>Today: every request to the API</span>
          <strong>{money.format(result.before)}</strong>
          <small>per month</small>
        </div>
        <div className="cost-stat">
          <span>
            After: {Math.round(inputs.movableShare * 100)}% on{' '}
            {result.gpus === 1 ? 'one GPU' : `${result.gpus} GPUs`}, the rest on
            the API
          </span>
          <strong>{money.format(result.after)}</strong>
          <small>per month</small>
        </div>
        <div className="cost-stat">
          <span>
            {result.savings >= 0 ? 'You save' : 'The API is cheaper by'}
          </span>
          <strong>{money.format(Math.abs(result.savings))}</strong>
          <small>
            per month
            {result.before > 0 && result.savings > 0
              ? `, ${Math.round((result.savings / result.before) * 100)}% of the bill`
              : ''}
          </small>
        </div>
      </div>
      <p className="cost-calc-breakeven">
        {breakEven === null
          ? 'With these numbers, your own GPUs never become cheaper than the API.'
          : `Own GPUs start to pay off at about ${count.format(Math.ceil(breakEven))} requests a day. Below that, stay on the API.`}
      </p>

      <div className="cost-chart" ref={box}>
        <svg
          style={{ width: '100%', height: 'auto', display: 'block' }}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Monthly cost against requests per day, up to ${compactCount(xMax)} a day. The API line rises steadily; the own-GPU line starts higher and rises slowly.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line
                className="grid"
                x1={PAD.left}
                x2={width - PAD.right}
                y1={sy(t)}
                y2={sy(t)}
              />
              <text
                className="tick"
                x={PAD.left - 8}
                y={sy(t) + 4}
                textAnchor="end"
              >
                {compactMoney(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={`x${t}`}
              className="tick"
              x={sx(t)}
              y={H - 14}
              textAnchor="middle"
            >
              {compactCount(t)}
            </text>
          ))}
          <text
            className="tick"
            x={width - PAD.right}
            y={H - 1}
            textAnchor="end"
          >
            requests per day
          </text>
          <line
            className="you"
            x1={sx(cur.x)}
            x2={sx(cur.x)}
            y1={PAD.top}
            y2={PAD.top + ih}
          />
          <text
            className="tick you-label"
            x={sx(cur.x) + 6}
            y={PAD.top + ih - 8}
          >
            You today
          </text>
          <path className="line before" d={path('before')} />
          <path className="line after" d={path('after')} />
          {breakEven !== null && breakEven <= xMax && (
            <circle
              className="dot after"
              cx={sx(breakEven)}
              cy={sy(
                monthlyCost({ ...inputs, requestsPerDay: breakEven }).before,
              )}
              r={5}
            />
          )}
          {hp && (
            <g>
              <line
                className="cross"
                x1={sx(hp.x)}
                x2={sx(hp.x)}
                y1={PAD.top}
                y2={PAD.top + ih}
              />
              <circle
                className="dot before"
                cx={sx(hp.x)}
                cy={sy(hp.before)}
                r={5}
              />
              <circle
                className="dot after"
                cx={sx(hp.x)}
                cy={sy(hp.after)}
                r={5}
              />
            </g>
          )}
        </svg>
        {hp && (
          <div
            className="cost-tip"
            style={{
              left: Math.min(Math.max(sx(hp.x), 90), width - 90),
            }}
          >
            <strong>{count.format(hp.x)} requests a day</strong>
            <span>
              <i className="swatch before" /> API: {money.format(hp.before)}/mo
            </span>
            <span>
              <i className="swatch after" /> Own GPUs: {money.format(hp.after)}
              /mo
            </span>
          </div>
        )}
      </div>

      <div className="cost-legend" aria-hidden="true">
        <span>
          <i className="swatch before" /> Every request to the API
        </span>
        <span>
          <i className="swatch after" /> Small model on own GPUs, rest on the
          API
        </span>
      </div>
      <details className="cost-calc-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Requests per day</th>
              <th>Every request to the API</th>
              <th>Small model on own GPUs</th>
            </tr>
          </thead>
          <tbody>
            {tableVolumes.map((v) => {
              const r = monthlyCost({ ...inputs, requestsPerDay: v });
              return (
                <tr key={v}>
                  <td>{count.format(v)}</td>
                  <td>{money.format(r.before)}</td>
                  <td>{money.format(r.after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      <p className="cost-calc-note">
        The starting numbers are an example, not a quote. Change them to yours.
        The estimate leaves out the engineering time to run your own GPUs, and
        it assumes the small model meets your quality bar on the share you move.
      </p>
    </figure>
  );
}
