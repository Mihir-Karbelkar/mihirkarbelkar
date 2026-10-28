import type { Capability } from './models';
type GPUish = {
  requestAdapter(): Promise<{
    features: { has(f: string): boolean };
    limits: { maxBufferSize: number };
  } | null>;
};
type NavigatorExtras = Navigator & {
  gpu?: GPUish;
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
  userAgentData?: { mobile?: boolean };
};
export async function detectCapability(): Promise<Capability> {
  const n = navigator as NavigatorExtras;
  const mobile =
    n.userAgentData?.mobile ??
    (/Android|iPhone|iPad|iPod|Mobile/i.test(n.userAgent) ||
      (n.maxTouchPoints > 1 && /Macintosh/.test(n.userAgent)));
  const metered =
    !!n.connection?.saveData ||
    /(^|-)([23]g)$/.test(n.connection?.effectiveType || '') ||
    matchMedia('(prefers-reduced-data: reduce)').matches;
  let adapter = null;
  try {
    adapter = (await n.gpu?.requestAdapter()) ?? null;
  } catch {}
  return {
    webgpu: !!adapter,
    shaderF16: !!adapter?.features.has('shader-f16'),
    maxBufferSize: adapter?.limits.maxBufferSize || 0,
    deviceMemory: n.deviceMemory,
    mobile,
    metered,
  };
}
