import test from 'node:test';
import assert from 'node:assert/strict';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import {
  TIERS,
  autoDownload,
  fallbackTier,
  pickTier,
  route,
  type Capability,
} from '../src/lib/models.ts';

const desktop: Capability = {
  webgpu: true,
  shaderF16: true,
  maxBufferSize: 2 ** 31,
  deviceMemory: 8,
  mobile: false,
  metered: false,
};
test('every tier maps to a WebLLM prebuilt model', () => {
  const ids = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));
  for (const t of TIERS) assert.ok(ids.has(t.f16) && ids.has(t.f32), t.id);
});
test('pickTier chooses by capability', () => {
  const cases: [Partial<Capability>, string | null][] = [
    [{}, 'qwen-1.5b'],
    [{ webgpu: false }, null],
    [{ maxBufferSize: 2 ** 28 }, 'qwen-0.5b'],
    [{ deviceMemory: 4 }, 'qwen-0.5b'],
    [{ deviceMemory: undefined }, 'qwen-1.5b'],
    [{ mobile: true, deviceMemory: 8 }, 'qwen-0.5b'],
    [{ mobile: true, deviceMemory: 4 }, 'smollm-360m'],
    [{ mobile: true, deviceMemory: undefined }, 'smollm-360m'],
    [{ deviceMemory: 2 }, 'smollm-360m'],
  ];
  for (const [patch, want] of cases)
    assert.equal(pickTier({ ...desktop, ...patch }), want, JSON.stringify(patch));
});
test('fallbacks, auto download and auto routing', () => {
  assert.equal(fallbackTier('qwen-1.5b'), 'qwen-0.5b');
  assert.equal(fallbackTier('smollm-360m'), null);
  assert.equal(autoDownload(desktop), true);
  assert.equal(autoDownload({ ...desktop, metered: true }), false);
  assert.equal(autoDownload({ ...desktop, mobile: true }), false);
  assert.equal(route({ 'qwen-0.5b': 'ready', 'qwen-1.5b': 'loading' }, 'auto'), 'qwen-0.5b');
  assert.equal(route({ 'qwen-0.5b': 'ready', 'qwen-1.5b': 'ready' }, 'auto'), 'qwen-1.5b');
  assert.equal(route({ 'qwen-0.5b': 'ready' }, 'qwen-1.5b'), null);
  assert.equal(route({}, 'auto'), null);
});

import { ModelManager, type EngineDeps } from '../src/lib/model-manager.ts';
function fakeDeps(cap: Capability, opts: { fail?: string[]; cached?: string[] } = {}) {
  const calls: string[] = [],
    idle: (() => void)[] = [];
  const deps: EngineDeps = {
    detect: async () => cap,
    load: async (m) => {
      calls.push(`load ${m}`);
      if (opts.fail?.includes(m)) throw new Error('boom');
    },
    unload: (m) => void calls.push(`unload ${m}`),
    prefetch: async (m) => void calls.push(`prefetch ${m}`),
    isCached: async (m) => !!opts.cached?.includes(m),
    idle: (fn) => void idle.push(fn),
  };
  return { deps, calls, idle };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
test('desktop downloads the preferred model, then prefetches the fallback when idle', async () => {
  const { deps, calls, idle } = fakeDeps(desktop);
  const m = new ModelManager(deps);
  await m.init();
  await settle();
  assert.equal(m.state.active, 'qwen-1.5b');
  assert.deepEqual(calls, ['load Qwen2.5-1.5B-Instruct-q4f16_1-MLC']);
  idle.forEach((f) => f());
  await settle();
  assert.equal(calls.at(-1), 'prefetch Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  assert.equal(m.state.tiers['qwen-0.5b'].cached, true);
});
test('mobile waits for consent unless the model is already cached', async () => {
  const mobile = { ...desktop, mobile: true, deviceMemory: 4, shaderF16: false };
  const a = fakeDeps(mobile);
  const m = new ModelManager(a.deps);
  await m.init();
  assert.equal(m.state.needsConsent, true);
  assert.deepEqual(a.calls, []);
  m.consent();
  await settle();
  assert.equal(m.state.active, 'smollm-360m');
  assert.deepEqual(a.calls, ['load SmolLM2-360M-Instruct-q4f32_1-MLC']);
  assert.equal(a.idle.length, 0, 'no background prefetch on mobile');
  const b = fakeDeps(mobile, { cached: ['SmolLM2-360M-Instruct-q4f32_1-MLC'] });
  const n = new ModelManager(b.deps);
  await n.init();
  await settle();
  assert.equal(n.state.needsConsent, false);
  assert.equal(n.state.active, 'smollm-360m');
});
test('auto steps down when a model fails; no WebGPU marks every tier unsupported', async () => {
  const a = fakeDeps(desktop, { fail: ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC'] });
  const m = new ModelManager(a.deps);
  await m.init();
  await settle();
  await settle();
  assert.equal(m.state.tiers['qwen-1.5b'].status, 'error');
  assert.equal(m.state.active, 'qwen-0.5b');
  const b = fakeDeps({ ...desktop, webgpu: false });
  const n = new ModelManager(b.deps);
  await n.init();
  assert.equal(n.state.active, null);
  assert.ok(Object.values(n.state.tiers).every((t) => t.status === 'unsupported'));
  assert.deepEqual(b.calls, []);
});
test('choosing a model loads it and frees the previous one', async () => {
  const { deps, calls } = fakeDeps(desktop);
  const m = new ModelManager(deps);
  await m.init();
  await settle();
  m.choose('smollm-360m');
  await settle();
  assert.equal(m.state.active, 'smollm-360m');
  assert.ok(calls.includes('unload Qwen2.5-1.5B-Instruct-q4f16_1-MLC'));
});
