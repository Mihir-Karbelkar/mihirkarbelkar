import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  // Load Markdown and MDX files in the `src/content/blog/` directory.
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  // Type-check frontmatter using a schema
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Transform string to Date object
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    category: z.enum(['tech']).default('tech'),
    // 'withering': the sakura branch ages as the reader scrolls
    mood: z.enum(['withering']).optional(),
    // false keeps a post out of the chat's search index
    index: z.boolean().default(true),
  }),
});

export const collections = { blog };
