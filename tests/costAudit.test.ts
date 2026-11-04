import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_EMAIL,
  auditMailto,
  auditQuestions,
  openItems,
} from '../src/lib/costAudit.ts';

const body = (href: string) =>
  decodeURIComponent(new URL(href).searchParams.get('body') ?? '');

test('open items count every no and don’t know', () => {
  assert.equal(openItems(['yes', 'no', 'unsure', undefined]), 2);
});

test('mailto goes to the site address with a subject', () => {
  const href = auditMailto([]);
  assert.ok(href.startsWith(`mailto:${AUDIT_EMAIL}?`));
  assert.equal(
    new URL(href).searchParams.get('subject'),
    'Cost audit for our AI pipeline',
  );
});

test('with answers, the body lists every question and the score', () => {
  const answers = ['yes', 'no', 'unsure'] as const;
  const b = body(auditMailto([...answers]));
  assert.match(b, /2 of 7 came back/);
  for (const q of auditQuestions) assert.ok(b.includes(q));
  assert.match(b, /per core action\? Yes/);
  assert.match(b, /spend the most\? No/);
  assert.match(b, /quality bar\? Don't know/);
  assert.match(b, /high-volume step\? \(skipped\)/);
});

test('without answers, the body is a plain request', () => {
  const b = body(auditMailto([]));
  assert.match(b, /look over our pipeline/);
  assert.doesNotMatch(b, /came back/);
});
