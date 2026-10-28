import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestExcerpt,
  cleanAnswer,
  finalizeAnswer,
  isGrounded,
} from '../src/lib/chat/answer.ts';
import { systemPrompt, NOT_COVERED_REPLY } from '../src/lib/prompt.ts';
import { searchContent } from '../src/lib/content.ts';

const fleet = searchContent('robot fleet scale');
const sources = [
  {
    id: 'robot-fleet',
    title: 'Robot fleet scaling',
    href: '/projects/robot-fleet',
    text: 'The fleet platform needed to handle more concurrent robots without a hardware increase. I worked on backend performance and platform scaling. The platform scaled from approximately 8–10 to 100 concurrent robots on the same hardware.',
  },
  {
    id: 'skills',
    title: 'Technology stack',
    href: '/#skills',
    text: 'Backend & data: Go · Python · FastAPI · PostgreSQL · Redis · ClickHouse',
  },
];
test('finalizeAnswer links citations and the first title mention', () => {
  const segs = finalizeAnswer(
    'Here’s what I found: The Robot fleet scaling work took the platform to 100 concurrent robots [1]. It used Go and Python [2] [9].',
    sources,
  );
  const text = segs.map((s) => s.text).join('');
  assert.ok(!/here.s what i found/i.test(text));
  assert.ok(!text.includes('9'), 'invalid citation dropped');
  assert.deepEqual(
    segs.filter((s) => s.cite).map((s) => [s.cite, s.href]),
    [
      [1, '/projects/robot-fleet'],
      [2, '/#skills'],
    ],
  );
  assert.ok(
    segs.some(
      (s) =>
        s.text === 'Robot fleet scaling' &&
        s.href === '/projects/robot-fleet' &&
        !s.cite,
    ),
  );
});
test('cleanAnswer strips invented links, HTML and source labels', () => {
  assert.equal(
    cleanAnswer(
      'Based on the sources, see <b>this</b> [the page](https://evil.example) at https://x.y SOURCE robot-fleet: ok.',
    ),
    'see this the page at ok.',
  );
});
test('grounding accepts supported answers and rejects drift and action claims', () => {
  assert.ok(
    isGrounded(
      'Mihir worked on backend performance so the platform scaled to 100 concurrent robots on the same hardware [1].',
      sources,
    ),
  );
  assert.equal(
    isGrounded(
      'He built a quantum computer and won a Nobel prize for cryptography research.',
      sources,
    ),
    false,
  );
  assert.equal(
    isGrounded(
      'The change to light mode has been successfully executed.',
      sources,
    ),
    false,
  );
  assert.ok(isGrounded(NOT_COVERED_REPLY, sources));
  assert.equal(isGrounded('', sources), false);
});
test('prompt numbers sources and bounds their length', () => {
  const p = systemPrompt([
    ...sources,
    { id: 'x', title: 'Long', href: '/x', text: 'a'.repeat(5000) },
  ]);
  assert.ok(p.includes('[1] Robot fleet scaling') && p.includes('[3] Long'));
  assert.ok(!p.includes('a'.repeat(601)));
  assert.ok(p.includes(NOT_COVERED_REPLY));
  assert.ok(fleet.length > 0);
});
test('bestExcerpt picks the sentence that answers the question', () => {
  assert.match(
    bestExcerpt(sources[0], 'how many robots did it scale to'),
    /100 concurrent robots/,
  );
});

import {
  runChat,
  retrievalQuery,
  type ChatDeps,
} from '../src/lib/chat/pipeline.ts';
import { GpuLostError } from '../src/lib/models.ts';
import type { AnswerEngine } from '../src/lib/chat/engine.ts';
const copy = {
  found: 'FOUND',
  ungrounded: 'UNGROUNDED',
  empty: 'EMPTY',
  error: 'ERROR',
};
const never = <T>() => new Promise<T>(() => {});
function deps(patch: Partial<ChatDeps> = {}): ChatDeps {
  return {
    rules: () => ({ kind: 'answer' }),
    search: async () => sources,
    keywordSearch: async () => sources.slice(0, 1),
    engine: () => null,
    copy,
    budgets: { route: 20, search: 30, firstToken: 40, idle: 40 },
    ...patch,
  };
}
const engineSaying = (text: string, delay = 0): AnswerEngine => ({
  id: 'fake',
  async generate(_m, onToken) {
    for (const t of text.split(/(?<= )/)) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      onToken(t);
    }
  },
});
test('rules and the warm router answer without search or a model', async () => {
  const nav = await runChat(
    'contact',
    [],
    deps({ rules: () => ({ kind: 'tour' }) }),
  );
  assert.deepEqual(nav, { kind: 'intent', intent: { kind: 'tour' } });
  const routed = await runChat(
    'make it brighter',
    [],
    deps({
      route: async () => 'theme-light',
      routerWarm: () => true,
      engine: () => {
        throw new Error('engine must not run');
      },
    }),
  );
  assert.deepEqual(routed, {
    kind: 'intent',
    intent: { kind: 'action', action: 'theme-light' },
  });
  let called = false;
  await runChat(
    'robots?',
    [],
    deps({
      route: async () => ((called = true), null),
      routerWarm: () => false,
    }),
  );
  assert.equal(called, false, 'cold router is skipped');
});
test('a hanging search falls back to keywords; total failure is an error card', async () => {
  const r = await runChat('robots', [], deps({ search: never }));
  assert.equal(r.kind, 'cards');
  assert.equal(r.kind === 'cards' && r.sources.length, 1);
  const e = await runChat(
    'robots',
    [],
    deps({ search: never, keywordSearch: never }),
  );
  assert.deepEqual(e, {
    kind: 'cards',
    intro: 'ERROR',
    sources: [],
    reason: 'error',
  });
  const empty = await runChat('zzz', [], deps({ search: async () => [] }));
  assert.equal(empty.kind === 'cards' && empty.reason, 'empty');
});
test('grounded model answers are linked; drift and action claims become cards', async () => {
  const ok = await runChat(
    'How did the fleet scale?',
    [],
    deps({
      engine: () =>
        engineSaying(
          'The platform scaled to 100 concurrent robots on the same hardware [1].',
        ),
    }),
  );
  assert.equal(ok.kind, 'answer');
  assert.ok(
    ok.kind === 'answer' &&
      ok.segments.some(
        (s) => s.cite === 1 && s.href === '/projects/robot-fleet',
      ),
  );
  const drift = await runChat(
    'Change to light mode',
    [],
    deps({
      engine: () =>
        engineSaying(
          'The change to light mode has been successfully executed.',
        ),
    }),
  );
  assert.deepEqual(drift.kind === 'cards' && [drift.reason, drift.intro], [
    'ungrounded',
    'UNGROUNDED',
  ]);
});
test('GPU loss and stalled generation fall back to cards', async () => {
  let lost = '';
  const gpu = await runChat(
    'fleet',
    [],
    deps({
      engine: () => ({
        id: 'qwen',
        generate: async () => {
          throw new GpuLostError();
        },
      }),
      onGpuLost: (id) => (lost = id),
    }),
  );
  assert.equal(gpu.kind === 'cards' && gpu.reason, 'error');
  assert.equal(lost, 'qwen');
  const stalled = await runChat(
    'fleet',
    [],
    deps({
      engine: () => ({
        id: 'slow',
        generate: (_m, _t, signal) =>
          new Promise((_, rej) =>
            signal.addEventListener('abort', () => rej(new Error('aborted'))),
          ),
      }),
    }),
  );
  assert.equal(stalled.kind === 'cards' && stalled.reason, 'error');
  const slowButSteady = await runChat(
    'fleet',
    [],
    deps({
      engine: () =>
        engineSaying(
          'The platform scaled to 100 concurrent robots [1]. It ran on the same hardware [1].',
          25,
        ),
    }),
  );
  assert.equal(
    slowButSteady.kind,
    'answer',
    'idle timer resets on every token',
  );
});
test('follow-ups are searched with the previous question', () => {
  const h = [
    { role: 'user' as const, content: 'Tell me about the robot fleet' },
    { role: 'assistant' as const, content: '…' },
  ];
  assert.equal(
    retrievalQuery('what stack did it use?', h),
    'Tell me about the robot fleet what stack did it use?',
  );
  assert.equal(
    retrievalQuery(
      'What did you build at Superstocks with Pinecone and SQL agents?',
      h,
    ),
    'What did you build at Superstocks with Pinecone and SQL agents?',
  );
  assert.equal(retrievalQuery('anything', []), 'anything');
});
