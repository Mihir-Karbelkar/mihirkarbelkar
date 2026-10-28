import Icon from '../ui/Icon';
import type { ManagerState, ModelManager } from '../../lib/model-manager';
import { TIERS, formatSize } from '../../lib/models';
/**
 * The only model UI visitors see: an opt-in button when a download needs
 * consent, and download progress while it runs. No model names.
 */
export default function AssistantStatus({
  state: m,
  manager,
  copy,
}: {
  state: ManagerState;
  manager: ModelManager;
  copy: { enable: string; preparing: string };
}) {
  const preferred = TIERS.find((t) => t.id === m.preferred);
  const loading = TIERS.find((t) => m.tiers[t.id].status === 'loading');
  if (m.needsConsent && preferred)
    return (
      <button
        type="button"
        className="model-consent"
        onClick={() => manager.consent()}
      >
        <Icon name="sparkle" /> {copy.enable} (≈
        {formatSize(preferred.downloadMB)})
      </button>
    );
  if (!loading) return null;
  const s = m.tiers[loading.id];
  const detail = s.text.startsWith('Downloading ')
    ? s.text.slice('Downloading '.length)
    : '';
  return (
    <p className="assistant-status" role="status">
      <svg
        className="chat-ring"
        viewBox="0 0 18 18"
        width="16"
        height="16"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="7" />
        <circle
          cx="9"
          cy="9"
          r="7"
          className="chat-ring-value"
          strokeDasharray={44}
          strokeDashoffset={44 * (1 - Math.max(0.03, s.progress))}
        />
      </svg>
      <span>
        {copy.preparing}
        {detail ? ` · ${detail}` : '…'}
      </span>
      <button
        type="button"
        className="model-cancel"
        onClick={() => manager.cancel(loading.id)}
      >
        Pause
      </button>
    </p>
  );
}
