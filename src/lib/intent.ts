export type Intent =
  | { kind: 'navigate'; target: string; href: string; label: string }
  | { kind: 'tour' }
  | { kind: 'answer' };
export interface IntentContext {
  sections: { target: string; label: string; keywords: string[] }[];
  projects: { slug: string; title: string }[];
}
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
const TOUR =
  /\b(show me around|give me a tour|take me on a tour|tour|walk me through (the|this) site|look around)\b/;
// "show me X", "take me to X", "go to X", "open X", "where is X", "jump to your X"
const NAV =
  /^(?:please\s+)?(?:can you\s+)?(?:show(?: me)?|take me to|go to|open|jump to|scroll to|navigate to|where (?:is|are|can i find))\s+(?:the\s+|your\s+|my\s+)?(.+?)\s*(?:please|section|page)?$/;
const strip = (s: string) =>
  s.replace(/^(the|your|my)\s+/, '').replace(/\s+(section|page|please)$/, '');
/**
 * Decides whether a chat message is a request to move around the page
 * (answered by scrolling, no model needed), a tour, or a question.
 */
export function routeIntent(query: string, ctx: IntentContext): Intent {
  const q = norm(query);
  if (!q) return { kind: 'answer' };
  if (TOUR.test(q)) return { kind: 'tour' };
  const asked = q.match(NAV)?.[1];
  // Only explicit navigation phrasing, or a message that is just a keyword.
  const subject = strip(asked ?? q);
  if (!asked && subject.split(' ').length > 3) return { kind: 'answer' };
  const project = ctx.projects.find((p) => {
    const title = norm(p.title),
      bare = title.replace(/\.[a-z]+$/, '');
    return (
      subject === title ||
      subject === bare ||
      subject === norm(p.slug) ||
      (!!asked &&
        (subject.includes(bare) || bare.includes(subject)) &&
        subject.length > 3)
    );
  });
  if (project)
    return {
      kind: 'navigate',
      target: `#project-${project.slug}`,
      href: `/projects/${project.slug}`,
      label: project.title,
    };
  const section = ctx.sections.find((s) =>
    s.keywords.some((k) => subject === norm(k)),
  );
  if (section)
    return {
      kind: 'navigate',
      target: section.target,
      href: `/${section.target}`,
      label: section.label,
    };
  return { kind: 'answer' };
}
