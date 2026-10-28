import {
  TIERS,
  autoDownload,
  fallbackTier,
  modelId,
  pickTier,
  route,
  type Capability,
  type Status,
  type TierId,
} from './models.ts';
type Progress = (text: string, value: number) => void;
export interface EngineDeps {
  detect(): Promise<Capability>;
  load(model: string, progress: Progress): Promise<unknown>;
  unload(model: string): void;
  prefetch(model: string, progress: Progress): Promise<void>;
  isCached(model: string): Promise<boolean>;
  /** Runs work when the page is idle (requestIdleCallback in the browser). */
  idle(fn: () => void): void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}
export interface TierState {
  status: Status;
  progress: number;
  text: string;
  cached: boolean;
}
export interface ManagerState {
  capability: Capability | null;
  preferred: TierId | null;
  choice: TierId | 'auto';
  /** True when a download is waiting for the visitor to agree (mobile/metered). */
  needsConsent: boolean;
  /** The tier generation would use right now, if any. */
  active: TierId | null;
  tiers: Record<TierId, TierState>;
}
const CHOICE_KEY = 'portfolio-model-choice';
const blank = (): Record<TierId, TierState> =>
  Object.fromEntries(
    TIERS.map((t) => [
      t.id,
      { status: 'idle', progress: 0, text: '', cached: false },
    ]),
  ) as Record<TierId, TierState>;
export class ModelManager {
  private listeners = new Set<() => void>();
  state: ManagerState = {
    capability: null,
    preferred: null,
    choice: 'auto',
    needsConsent: false,
    active: null,
    tiers: blank(),
  };
  private started = false;
  private deps: EngineDeps;
  constructor(deps: EngineDeps) {
    this.deps = deps;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<ManagerState>) {
    const next = { ...this.state, ...patch };
    next.active = route(
      Object.fromEntries(
        Object.entries(next.tiers).map(([k, v]) => [k, v.status]),
      ),
      next.choice,
    );
    this.state = next;
    this.listeners.forEach((l) => l());
  }
  private setTier(id: TierId, patch: Partial<TierState>) {
    this.set({
      tiers: {
        ...this.state.tiers,
        [id]: { ...this.state.tiers[id], ...patch },
      },
    });
  }
  model(id: TierId) {
    return modelId(TIERS.find((t) => t.id === id)!, {
      shaderF16: !!this.state.capability?.shaderF16,
    });
  }
  /** Detects the device, probes the cache and starts the first download when allowed. */
  async init() {
    if (this.started) return;
    this.started = true;
    const capability = await this.deps.detect();
    const preferred = pickTier(capability);
    let choice: TierId | 'auto' = 'auto';
    try {
      const saved = this.deps.storage?.getItem(CHOICE_KEY);
      if (saved && TIERS.some((t) => t.id === saved)) choice = saved as TierId;
    } catch {}
    const tiers = blank();
    await Promise.all(
      TIERS.map(async (t) => {
        if (!capability.webgpu) tiers[t.id].status = 'unsupported';
        else
          tiers[t.id].cached = await this.deps.isCached(modelId(t, capability));
      }),
    );
    this.set({ capability, preferred, choice, tiers });
    if (!preferred) return;
    const first = choice === 'auto' ? preferred : choice;
    if (tiers[first].cached || autoDownload(capability)) void this.use(first);
    else this.set({ needsConsent: true });
  }
  /** Visitor agreed to download (or picked a model). */
  consent() {
    const id =
      this.state.choice === 'auto' ? this.state.preferred : this.state.choice;
    this.set({ needsConsent: false });
    if (id) void this.use(id);
  }
  choose(choice: TierId | 'auto') {
    try {
      this.deps.storage?.setItem(CHOICE_KEY, choice);
    } catch {}
    this.set({ choice, needsConsent: false });
    const id = choice === 'auto' ? this.state.preferred : choice;
    if (id && this.state.tiers[id].status !== 'ready') void this.use(id);
  }
  /** Loads a tier for generation, keeping only one model in GPU memory. */
  async use(id: TierId): Promise<void> {
    const t = this.state.tiers[id];
    if (
      t.status === 'ready' ||
      t.status === 'loading' ||
      t.status === 'unsupported'
    )
      return;
    for (const other of TIERS)
      if (other.id !== id && this.state.tiers[other.id].status === 'loading') {
        this.deps.unload(this.model(other.id));
        this.setTier(other.id, { status: 'idle', progress: 0, text: '' });
      }
    this.setTier(id, { status: 'loading', progress: 0, text: 'Starting…' });
    try {
      await this.deps.load(this.model(id), (text, progress) =>
        this.setTier(id, { text, progress }),
      );
      for (const other of TIERS)
        if (other.id !== id && this.state.tiers[other.id].status === 'ready') {
          this.deps.unload(this.model(other.id));
          this.setTier(other.id, { status: 'idle', cached: true });
        }
      this.setTier(id, {
        status: 'ready',
        progress: 1,
        text: '',
        cached: true,
      });
      this.schedulePrefetch(id);
    } catch (e) {
      if (this.state.tiers[id].status !== 'loading') return; // cancelled
      this.setTier(id, {
        status: 'error',
        text: e instanceof Error ? e.message : 'The model failed to load.',
      });
      // Auto mode quietly steps down to the next smaller model.
      const next = fallbackTier(id);
      if (this.state.choice === 'auto' && next) await this.use(next);
    }
  }
  private schedulePrefetch(id: TierId) {
    const next = fallbackTier(id),
      cap = this.state.capability;
    if (!next || !cap || !autoDownload(cap) || this.state.tiers[next].cached)
      return;
    this.deps.idle(() => {
      if (this.state.tiers[next].status !== 'idle') return;
      void this.deps
        .prefetch(this.model(next), () => {})
        .then(() => this.setTier(next, { cached: true }))
        .catch(() => {});
    });
  }
  cancel(id: TierId) {
    if (this.state.tiers[id].status !== 'loading') return;
    this.deps.unload(this.model(id));
    this.setTier(id, { status: 'idle', progress: 0, text: '' });
  }
}
