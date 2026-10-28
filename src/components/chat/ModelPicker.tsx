import { useEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import type {
  ManagerState,
  ModelManager,
  TierState,
} from '../../lib/model-manager';
import { TIERS, formatSize, type Tier, type TierId } from '../../lib/models';
function Ring({ value }: { value: number }) {
  const r = 7,
    c = 2 * Math.PI * r;
  return (
    <svg
      className="chat-ring"
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r={r} />
      <circle
        cx="9"
        cy="9"
        r={r}
        className="chat-ring-value"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.03, value))}
      />
    </svg>
  );
}
const describe = (s: TierState) =>
  s.status === 'ready'
    ? 'Ready'
    : s.status === 'loading'
      ? `Downloading ${Math.round(s.progress * 100)}%`
      : s.status === 'unsupported'
        ? 'Needs WebGPU'
        : s.status === 'error'
          ? 'Failed to load'
          : s.cached
            ? 'Downloaded'
            : 'Not downloaded';
export default function ModelPicker({
  state: m,
  manager,
  loading,
}: {
  state: ManagerState;
  manager: ModelManager;
  loading?: { t: Tier; s: TierState };
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);
  const active = TIERS.find((t) => t.id === m.active);
  const preferred = TIERS.find((t) => t.id === m.preferred);
  const label = !m.capability
    ? 'Checking this device…'
    : !m.capability.webgpu
      ? 'Search mode'
      : loading
        ? `${loading.t.label} · ${Math.round(loading.s.progress * 100)}%`
        : active
          ? `${m.choice === 'auto' ? 'Auto · ' : ''}${active.label}`
          : 'Search mode';
  const pick = (choice: TierId | 'auto') => {
    manager.choose(choice);
    setOpen(false);
  };
  return (
    <div className="model-picker" ref={root}>
      {m.needsConsent && preferred && (
        <button
          type="button"
          className="model-consent"
          onClick={() => manager.consent()}
        >
          <Icon name="download" /> Load the AI (
          {formatSize(preferred.downloadMB)})
        </button>
      )}
      <button
        type="button"
        className={`model-chip${m.capability ? '' : ' is-pending'}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        {loading ? <Ring value={loading.s.progress} /> : <Icon name="chip" />}
        <span>{label}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="model-menu" role="menu" aria-label="Choose a model">
          <p className="model-menu-note">
            {m.capability?.webgpu
              ? 'Models run entirely in your browser. Weights are cached after the first download.'
              : 'This browser has no WebGPU, so answers come from site search.'}
          </p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={m.choice === 'auto'}
            onClick={() => pick('auto')}
            disabled={!m.capability?.webgpu}
          >
            <span>
              <strong>Auto</strong>
              <small>
                Best model that’s ready
                {preferred ? ` · starts with ${preferred.label}` : ''}
              </small>
            </span>
            {m.choice === 'auto' && <Icon name="sparkle" />}
          </button>
          {TIERS.map((t) => {
            const s = m.tiers[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={m.choice === t.id}
                disabled={s.status === 'unsupported'}
                onClick={() => pick(t.id)}
              >
                <span>
                  <strong>{t.label}</strong>
                  <small>
                    {t.note} · about {formatSize(t.downloadMB)} · {describe(s)}
                  </small>
                </span>
                {s.status === 'loading' ? (
                  <Ring value={s.progress} />
                ) : (
                  m.choice === t.id && <Icon name="sparkle" />
                )}
              </button>
            );
          })}
          {loading && (
            <p className="model-menu-note" aria-live="polite">
              {loading.s.text}{' '}
              <button
                type="button"
                className="model-cancel"
                onClick={() => manager.cancel(loading.t.id)}
              >
                Pause
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
