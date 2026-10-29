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
