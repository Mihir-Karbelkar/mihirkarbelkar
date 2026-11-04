import test from 'node:test';
import assert from 'node:assert/strict';
import {
  site,
  projects,
  featuredSlugs,
  archiveSlugs,
  notes,
  skills,
} from '../src/data/portfolio.ts';
import { projectsSchema } from '../src/data/schema.ts';

test('site JSON parses and drives navigation', () => {
  assert.ok(site.nav.length > 0);
  assert.ok(site.nav.every((l) => l.href.startsWith('/')));
  assert.ok(site.tour.every((s) => s.target.startsWith('#')));
});
test('featured and archive slugs resolve to projects', () => {
  const slugs = new Set(projects.map((p) => p.slug));
  for (const s of [...featuredSlugs, ...archiveSlugs]) assert.ok(slugs.has(s));
  assert.ok(notes.length > 0 && skills.length > 0);
});
test('unknown featured slug is rejected', () => {
  const r = projectsSchema.safeParse({
    featured: ['missing'],
    archive: [],
    items: [projects[0]],
  });
  assert.equal(r.success, false);
});
import { career, roleYears, formatMonth } from '../src/data/portfolio.ts';
import { searchContent, sources as chatSources } from '../src/lib/content.ts';
test('career data drives the timeline and the chat', () => {
  assert.ok(career.roles.length >= 4);
  assert.equal(formatMonth('2023-12'), 'Dec 2023');
  assert.equal(
    roleYears(career.roles.find((r) => r.id === 'wiz')!),
    '2021–2023',
  );
  assert.equal(searchContent('Razorpay')[0].id, 'career-razorpay');
  assert.ok(
    searchContent('education degree').some((s) => s.id === 'education'),
  );
  const all = JSON.stringify(chatSources);
  assert.ok(!all.includes('99.98') && !all.includes('900,000'));
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
test('positioning: current roles, no retired claims or names', () => {
  const stealth = career.roles.find((r) => r.id === 'stealth-startup')!;
  assert.equal(roleYears(stealth), '2026–Present');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const text = files('src/data')
    .concat(files('src/pages'), files('src/components'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  for (const banned of [
    /superstocks/i,
    /99\.9\d?%/,
    /cloudfront/i,
    /frontend engineer/i,
  ])
    assert.ok(!banned.test(text), String(banned));
  assert.ok(featuredSlugs.includes('knowledge-injection'));
});
import { mailtoHref } from '../src/lib/enquiry.ts';
import { profile } from '../src/data/portfolio.ts';
test('enquiries fall back to a prefilled email to the published address', () => {
  const href = mailtoHref(profile.email, {
    name: 'Ada',
    email: 'ada@example.com',
    projectType: 'Training-data pipelines',
    message: 'We need evals & data.',
  });
  assert.ok(href.startsWith(`mailto:${profile.email}?subject=`));
  const u = new URL(href);
  assert.equal(
    u.searchParams.get('subject'),
    'Project enquiry: Training-data pipelines',
  );
  assert.equal(
    u.searchParams.get('body'),
    'We need evals & data.\n\nAda\nada@example.com',
  );
});
