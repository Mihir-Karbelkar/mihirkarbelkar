import { stopWords, terms } from '../text.ts';
import type { Source } from '../prompt.ts';
/** A rendered piece of an answer: plain text, a link, or a citation link. */
export type Segment = { text: string; href?: string; cite?: number };
const PREAMBLE =
  /^\s*(here['’]s what i found|here is what i found|based on (the )?(provided |numbered |given )?sources?|according to (the )?sources?|as an ai[^.!?]*|sure|certainly|great question|answer)\s*[:,.!—-]*\s*/i;
/** Strips preambles, links, HTML and source labels a model may emit. */
export function cleanAnswer(text: string): string {
  let t = text
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\bSOURCE\s+[\w-]+:?/gi, '')
    .replace(/\(\s*(\[\d+\]\s*)+\)/g, (m) => m.slice(1, -1));
  for (let i = 0; i < 3 && PREAMBLE.test(t); i++) t = t.replace(PREAMBLE, '');
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}
/** Turns [n] markers into links to source n, and links each source's first title mention. */
export function finalizeAnswer(text: string, sources: Source[]): Segment[] {
  const out: Segment[] = [];
  const parts = cleanAnswer(text).split(/\[(\d+)\]/);
  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      if (p) out.push({ text: p });
      return;
    }
    const n = Number(p),
      s = sources[n - 1];
    if (s) out.push({ text: String(n), href: s.href, cite: n });
  });
  for (const s of sources) {
    const title = s.title.trim();
    if (title.length < 4 || out.some((x) => x.href === s.href && !x.cite))
      continue;
    const i = out.findIndex(
      (x) => !x.href && x.text.toLowerCase().includes(title.toLowerCase()),
    );
    if (i < 0) continue;
    const seg = out[i],
      at = seg.text.toLowerCase().indexOf(title.toLowerCase());
    out.splice(
      i,
      1,
      ...[
        { text: seg.text.slice(0, at) },
        { text: seg.text.slice(at, at + title.length), href: s.href },
        { text: seg.text.slice(at + title.length) },
      ].filter((x) => x.text),
    );
  }
  return out;
}
/** Plain text of an answer with citation markers removed. */
export const plainAnswer = (text: string) =>
  cleanAnswer(text)
    .replace(/\s*\[\d+\]/g, '')
    .trim();
// Words that carry no claim, beyond the search stopwords.
const FILLER = new Set([
  ...stopWords,
  'he',
  'his',
  'him',
  'has',
  'have',
  'had',
  'was',
  'were',
  'are',
  'be',
  'been',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'they',
  'their',
  'also',
  'which',
  'on',
  'at',
  'by',
  'as',
  'or',
  'from',
  'into',
  'more',
  'site',
  'sources',
  'source',
  'page',
  'karbelkar',
  'like',
  'such',
  'using',
  'used',
  'use',
  'uses',
  'well',
  'other',
  'some',
  'many',
  'than',
  'there',
  'then',
  'so',
  'not',
  'no',
  'yes',
  'one',
  'two',
  'part',
]);
const stem = (w: string) =>
  w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, '') : w;
const content = (s: string) =>
  terms(s)
    .filter((w) => w.length > 2 && !FILLER.has(w))
    .map(stem);
const ACTION_CLAIM =
  /\b(has been|have been|was|is now|successfully)\s+(changed|executed|switched|updated|applied|enabled|disabled|sent|submitted|completed|done)\b|\bi (have|'ve|just)?\s*(changed|switched|updated|executed|sent|booked|scheduled)\b|\bsuccessfully\b/i;
const NOT_COVERED =
  /\b(isn['’]t|is not|not) (covered|published|mentioned|on the site)\b|\bdon['’]t have (that|information|details)\b|\bno information\b/i;
export const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
/**
 * Whether a generated answer is supported by its sources. A sentence counts
 * as supported when at least half its content words appear in the sources;
 * the answer needs 60% of its sentences supported. Claims of having taken an
 * action always fail; an explicit "not covered" reply passes.
 */
export function isGrounded(text: string, sources: Source[]): boolean {
  const plain = plainAnswer(text);
  if (!plain) return false;
  if (ACTION_CLAIM.test(plain)) return false;
  if (NOT_COVERED.test(plain) && plain.length < 240) return true;
  const vocab = new Set(
    sources.flatMap((s) => content(`${s.title} ${s.text}`)),
  );
  const all = sentences(plain);
  const supported = all.filter((s) => {
    const words = content(s);
    if (!words.length) return true;
    return words.filter((w) => vocab.has(w)).length / words.length >= 0.5;
  });
  return all.length > 0 && supported.length / all.length >= 0.6;
}
/** The source sentence that best matches the question, for result cards. */
export function bestExcerpt(source: Source, query: string, max = 220): string {
  const q = new Set(content(query));
  const ranked = sentences(source.text)
    .map((s, i) => ({
      s,
      i,
      score: content(s).filter((w) => q.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const pick = ranked[0]?.s ?? source.text;
  return pick.length > max ? `${pick.slice(0, max - 1).trimEnd()}…` : pick;
}
