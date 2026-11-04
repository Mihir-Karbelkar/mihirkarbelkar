import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_EMAIL,
  auditCta,
  auditMailto,
  auditQuestions,
  openItems,
} from '../src/lib/costAudit.ts';
import type { Answer } from '../src/lib/costAudit.ts';

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

test('the email button gets more urgent as gaps add up', () => {
  const all = (a: 'yes' | 'no') => auditQuestions.map(() => a);
  assert.deepEqual(auditCta([]), {
    label: 'Get help with your AI costs',
    urgency: 'calm',
  });
  assert.equal(auditCta(all('yes')).label, 'Get a second opinion');
  assert.deepEqual(auditCta(['no']), {
    label: 'Fix your 1 cost leak',
    urgency: 'some',
  });
  assert.equal(
    auditCta(['no', 'unsure', 'yes']).label,
    'Fix your 2 cost leaks',
  );
  assert.deepEqual(auditCta(['no', 'no', 'no', 'unsure']), {
    label: '4 leaks: get help now',
    urgency: 'urgent',
  });
  assert.equal(auditCta(all('no')).label, '7 leaks: let’s talk today');
  for (let n = 0; n <= 7; n++) {
    const a = auditQuestions.map((_, i): Answer => (i < n ? 'no' : 'yes'));
    assert.ok(auditCta(a).label.length <= 27, auditCta(a).label);
  }
});
