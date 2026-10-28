import { sources } from './content.ts';
export type DocKind =
  | 'project'
  | 'about'
  | 'skills'
  | 'contact'
  | 'blog'
  | 'essay';
export interface Doc {
  id: string;
  title: string;
  href: string;
  kind: DocKind;
  text: string;
}
export interface Chunk {
  id: string;
  doc: string;
  title: string;
  href: string;
  kind: DocKind;
  text: string;
}
export interface SearchManifest {
  version: string;
  model: string;
  chunks: Chunk[];
}
export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
/** FNV-1a; a cache key for embeddings, not a security hash. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** Greedy sentence packing into ~size-character chunks, carrying the last sentence(s) over as overlap. */
export function chunkText(text: string, size = 600, overlap = 100): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const out: string[] = [];
  let current: string[] = [];
  const length = (parts: string[]) => parts.join(' ').length;
  for (const sentence of sentences) {
    if (current.length && length([...current, sentence]) > size) {
      out.push(current.join(' '));
      const carry: string[] = [];
      for (let i = current.length - 1; i >= 0; i--) {
        if (length([current[i], ...carry]) > overlap) break;
        carry.unshift(current[i]);
      }
      current = carry;
    }
    current.push(sentence);
  }
  if (current.length) out.push(current.join(' '));
  return out;
}
/** Removes Markdown/MDX syntax so the embedded text is prose. */
export function plainMarkdown(md: string): string {
  return md
    .replace(/^(import|export)\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\n{2,}/g, '.\n')
    .replace(/\.\.+/g, '.');
}
const kindOf = (id: string, href: string): DocKind =>
  href.startsWith('/projects/')
    ? 'project'
    : id === 'contact'
      ? 'contact'
      : id === 'about'
        ? 'about'
        : 'skills';
export function siteDocs(): Doc[] {
  return sources.map((s) => ({ ...s, kind: kindOf(s.id, s.href) }));
}
export function buildChunks(docs: Doc[]): Chunk[] {
  return docs.flatMap((d) =>
    chunkText(d.text).map((text, i) => ({
      id: `${d.id}#${i}`,
      doc: d.id,
      title: d.title,
      href: d.href,
      kind: d.kind,
      text,
    })),
  );
}
export function buildManifest(docs: Doc[]): SearchManifest {
  const chunks = buildChunks(docs);
  return {
    version: hashString(
      EMBED_MODEL + chunks.map((c) => c.id + c.text).join('\n'),
    ),
    model: EMBED_MODEL,
    chunks,
  };
}
