import { z } from 'zod';
const link = z.object({ label: z.string(), href: z.string() });
const artwork = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    src: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    alt: z.string(),
    caption: z.string(),
  }),
  z.object({
    type: z.literal('video'),
    src: z.string(),
    poster: z.string(),
    label: z.string(),
    caption: z.string(),
  }),
  z.object({
    type: z.literal('diagram'),
    name: z.literal('lora'),
    caption: z.string(),
  }),
]);
export const projectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  category: z.string(),
  summary: z.string(),
  problem: z.string(),
  approach: z.array(z.string()),
  outcome: z.string(),
  metric: z.string(),
  metricLabel: z.string(),
  tags: z.array(z.string()),
  tone: z.enum(['lavender', 'mint', 'peach', 'blue']),
  status: z.string(),
  source: z.string().optional(),
  kind: z.enum(['professional', 'experiment', 'project']),
  reflection: z.string().optional(),
  artwork: artwork.optional(),
});
export const projectsSchema = z
  .object({
    featured: z.array(z.string()),
    archive: z.array(z.string()),
    items: z.array(projectSchema).min(1),
  })
  .superRefine((d, ctx) => {
    const slugs = new Set(d.items.map((p) => p.slug));
    if (slugs.size !== d.items.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate project slug' });
    for (const s of [...d.featured, ...d.archive])
      if (!slugs.has(s))
        ctx.addIssue({ code: 'custom', message: `Unknown project slug: ${s}` });
  });
export const siteSchema = z.object({
  profile: z.object({
    name: z.string(),
    location: z.string(),
    title: z.string(),
    jobTitle: z.string(),
    description: z.string(),
    github: z.string().url(),
    maths: z.string().url(),
  }),
  meta: z.object({ title: z.string() }),
  nav: z.array(link).min(1),
  footer: z.array(link),
  home: z.object({
    eyebrow: z.string(),
    headline: z.array(z.string()).min(1),
    body: z.string(),
    supporting: z.string(),
    primaryAction: z.string(),
    contactAction: z.string(),
    desk: z.object({
      heading: z.string(),
      body: z.string(),
      items: z.array(
        z.object({
          title: z.string(),
          label: z.string(),
          href: z.string(),
          art: z.enum(['model', 'brain', 'maths']),
          tone: z.enum(['lavender', 'sage', 'blue']),
        }),
      ),
    }),
    work: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      body: z.string(),
      readMore: z.string(),
    }),
    archive: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      body: z.string(),
    }),
    notes: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      archiveLabel: z.string(),
      archiveHref: z.string(),
    }),
    about: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      paragraphs: z.array(z.string()),
      toolsLabel: z.string(),
      tools: z.array(z.string()),
      more: z.string(),
    }),
    contact: z.object({
      eyebrow: z.string(),
      heading: z.string(),
      body: z.string(),
      github: z.string(),
      linkedin: z.string(),
      calendar: z.string(),
    }),
  }),
  aboutPage: z.object({
    title: z.string(),
    heading: z.string(),
    backLabel: z.string(),
    backgroundHeading: z.string(),
    background: z.array(z.string()),
    toolsHeading: z.string(),
    action: z.string(),
  }),
  chat: z.object({
    placeholder: z.string(),
    greeting: z.string(),
    suggestions: z.array(z.string()).max(6),
    contact: z.string(),
    /** Fixed copy around answers and result cards. */
    copy: z.object({
      found: z.string(),
      ungrounded: z.string(),
      empty: z.string(),
      error: z.string(),
      contactLabel: z.string(),
      answeredFrom: z.string(),
      enable: z.string(),
      preparing: z.string(),
    }),
    /** Site actions the chat can perform; the examples train the in-browser intent router. */
    actions: z.array(
      z.object({
        id: z.enum(['theme-light', 'theme-dark', 'tour', 'top']),
        reply: z.string(),
        examples: z.array(z.string()).min(1),
      }),
    ),
    /** Questions matching these keywords scroll to the section instead of generating an answer. */
    sections: z.array(
      z.object({
        target: z.string().startsWith('#'),
        label: z.string(),
        keywords: z.array(z.string()).min(1),
      }),
    ),
  }),
  tour: z.array(
    z.object({ target: z.string().startsWith('#'), say: z.string() }),
  ),
});
export const notesSchema = z.array(
  z.object({
    title: z.string(),
    summary: z.string(),
    detail: z.string(),
    href: z.string(),
    label: z.string(),
    external: z.boolean(),
  }),
);
export const skillsSchema = z.object({
  services: z.array(z.object({ title: z.string(), body: z.string() })),
  skills: z.array(z.object({ label: z.string(), items: z.string() })),
  experience: z.array(
    z.object({ area: z.string(), title: z.string(), body: z.string() }),
  ),
});
export type Project = z.infer<typeof projectSchema>;
export type Artwork = z.infer<typeof artwork>;
export type Site = z.infer<typeof siteSchema>;
