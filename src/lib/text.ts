export const terms = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/robots/g, 'robot')
    .replace(/agents/g, 'agent')
    .replace(/scaling|scaled/g, 'scale')
    .match(/[a-z0-9]+/g) ?? [];
export const stopWords = new Set([
  'the',
  'a',
  'an',
  'is',
  'to',
  'for',
  'and',
  'of',
  'in',
  'my',
  'your',
  'me',
  'what',
  'how',
  'can',
  'you',
  'about',
  'with',
  'does',
  'tell',
  'work',
  'mihir',
]);
/** Sentence embedding model for site search (browser query + chunk vectors). */
export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
