import {
  projects,
  profile,
  services,
  skills,
  experience,
} from '../data/portfolio.ts';
import { stopWords, terms } from './text.ts';
import type { Source } from './prompt.ts';
export type { Source } from './prompt.ts';
export { stopWords, terms } from './text.ts';
export { systemPrompt } from './prompt.ts';
export const sources: Source[] = [
  {
    id: 'about',
    title: 'About Mihir',
    href: '/#about',
    text: `${profile.name}. ${profile.title}. ${profile.description} Interfaces, performance, backend platforms and model experiments.`,
  },
  ...projects.map((p) => ({
    id: p.slug,
    title: p.title,
    href: `/projects/${p.slug}`,
    text: `${p.category} ${p.summary} ${p.problem} ${p.approach.join(' ')} ${p.outcome} ${p.tags.join(' ')}`,
  })),
  {
    id: 'services',
    title: 'How I work',
    href: '/#about',
    text: services.map((s) => `${s.title}: ${s.body}`).join('\n'),
  },
  {
    id: 'skills',
    title: 'Technology stack',
    href: '/#skills',
    text: skills.map((s) => `${s.label}: ${s.items}`).join('\n'),
  },
  {
    id: 'experience',
    title: 'Experience',
    href: '/#experience',
    text: experience.map((s) => `${s.area}: ${s.title}: ${s.body}`).join('\n'),
  },
  {
    id: 'contact',
    title: 'Say hello',
    href: '/#contact',
    text: 'Tell me what you’re working on. I’d like to hear about it. Use the verified links in the contact section. Rates and availability are not published.',
  },
];
export function searchContent(query: string, limit = 3): Source[] {
  const expanded = query
    .replace(/help|build|offer/gi, 'services')
    .replace(/robot[s]?/gi, 'robot')
    .replace(/agent[s]?/gi, 'agent');
  const q = [...new Set(terms(expanded).filter((t) => !stopWords.has(t)))];
  if (!q.length) return [];
  return sources
    .map((source) => ({
      source,
      score:
        (source.href.startsWith('/projects/') ? 0.25 : 0) +
        q.reduce(
          (sum, t) =>
            sum +
            (terms(source.id).includes(t) ? 5 : 0) +
            (terms(source.title).includes(t) ? 5 : 0) +
            (terms(source.text).includes(t) ? 1 : 0),
          0,
        ),
    }))
    .filter((s) => s.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.source);
}
