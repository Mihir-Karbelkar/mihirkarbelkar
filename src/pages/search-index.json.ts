import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildManifest, plainMarkdown, siteDocs } from '../lib/corpus';
import type { Doc } from '../lib/corpus';
export const prerender = true;
/** The chat's search corpus, rebuilt from the JSON data and Markdown on every build. */
export const GET: APIRoute = async () => {
  const blog = (await getCollection('blog', (p) => p.data.index)).map(
    (p): Doc => ({
      id: `blog-${p.id}`,
      title: p.data.title,
      href: `/blog/${p.id}`,
      kind: 'blog',
      text: `${p.data.description}. ${plainMarkdown(p.body || '')}`,
    }),
  );
  return new Response(JSON.stringify(buildManifest([...siteDocs(), ...blog])), {
    headers: { 'Content-Type': 'application/json' },
  });
};
