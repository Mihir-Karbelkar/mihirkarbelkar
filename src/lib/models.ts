export type TierId = 'qwen-1.5b' | 'qwen-0.5b' | 'smollm-360m';
export interface Tier {
  id: TierId;
  label: string;
  note: string;
  f16: string;
  f32: string;
  /** Approximate weight download, MB (shown with "about"). */
  downloadMB: number;
  /** From WebLLM's prebuilt catalog (f16 build). */
  vramMB: number;
}
/** Largest first. Auto routes to the first ready tier in this order. */
export const TIERS: Tier[] = [
  {
    id: 'qwen-1.5b',
    label: 'Qwen2.5 1.5B',
    note: 'Best answers',
    f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    downloadMB: 900,
    vramMB: 1630,
  },
  {
    id: 'qwen-0.5b',
    label: 'Qwen2.5 0.5B',
    note: 'Balanced',
    f16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    f32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    downloadMB: 300,
    vramMB: 945,
  },
  {
    id: 'smollm-360m',
    label: 'SmolLM2 360M',
    note: 'Lightest',
    f16: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    f32: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    downloadMB: 220,
    vramMB: 380,
  },
];
export interface Capability {
  webgpu: boolean;
  shaderF16: boolean;
  /** GPUAdapter.limits.maxBufferSize in bytes, 0 if unknown. */
  maxBufferSize: number;
  /** navigator.deviceMemory in GB, undefined if unsupported (Safari, Firefox). */
  deviceMemory?: number;
  mobile: boolean;
  /** saveData or a 2g/3g effective connection. */
  metered: boolean;
}
export const tier = (id: TierId) => TIERS.find((t) => t.id === id)!;
export const modelId = (t: Tier, cap: Pick<Capability, 'shaderF16'>) =>
  cap.shaderF16 ? t.f16 : t.f32;
/** The tier to download first on this device, or null when local generation can't run. */
export function pickTier(cap: Capability): TierId | null {
  if (!cap.webgpu) return null;
  const memory = cap.deviceMemory ?? (cap.mobile ? 4 : 8);
  if (!cap.mobile && memory >= 8 && cap.maxBufferSize >= 1 << 30)
    return 'qwen-1.5b';
  if (memory >= 6 || (!cap.mobile && memory >= 4)) return 'qwen-0.5b';
  return 'smollm-360m';
}
/** The next smaller tier, prefetched in the background as a fallback. */
export function fallbackTier(id: TierId): TierId | null {
  const i = TIERS.findIndex((t) => t.id === id);
  return TIERS[i + 1]?.id ?? null;
}
/** Desktop on an unmetered connection downloads straight away; everyone else is asked first. */
export const autoDownload = (cap: Capability) => !cap.mobile && !cap.metered;
export type Status = 'unsupported' | 'idle' | 'loading' | 'ready' | 'error';
/** Auto routing: the largest tier that is ready right now. */
export function route(
  statuses: Partial<Record<TierId, Status>>,
  choice: TierId | 'auto',
): TierId | null {
  if (choice !== 'auto') return statuses[choice] === 'ready' ? choice : null;
  return TIERS.find((t) => statuses[t.id] === 'ready')?.id ?? null;
}
export const formatSize = (mb: number) =>
  mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb / 10) * 10} MB`;
