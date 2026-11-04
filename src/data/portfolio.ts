// Content lives in the JSON files beside this module; edit those, not this file.
import siteJson from './site.json' with { type: 'json' };
import projectsJson from './projects.json' with { type: 'json' };
import notesJson from './notes.json' with { type: 'json' };
import skillsJson from './skills.json' with { type: 'json' };
import careerJson from './career.json' with { type: 'json' };
import {
  notesSchema,
  projectsSchema,
  siteSchema,
  skillsSchema,
  careerSchema,
} from './schema.ts';
export type { Project, Artwork } from './schema.ts';
export const site = siteSchema.parse(siteJson);
const projectData = projectsSchema.parse(projectsJson);
export const profile = {
  ...site.profile,
  // Env vars override the published defaults in site.json.
  email: import.meta.env?.PUBLIC_CONTACT_EMAIL || site.profile.email,
  linkedin: import.meta.env?.PUBLIC_LINKEDIN_URL || site.profile.linkedin,
};
export const home = site.home;
export const projects = projectData.items;
export const featuredSlugs = projectData.featured;
export const archiveSlugs = projectData.archive;
export const notes = notesSchema.parse(notesJson);
export const { services, skills } = skillsSchema.parse(skillsJson);
export const career = careerSchema.parse(careerJson);
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
/** "2023-12" -> "Dec 2023" */
export const formatMonth = (m: string) =>
  `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** "Dec 2023", or "Present" for a role without an end. */
export const formatEnd = (m?: string) => (m ? formatMonth(m) : 'Present');
/** First and last year a role spans, e.g. "2021–2023" or "2026–Present". */
export function roleYears(role: (typeof career.roles)[number]) {
  const starts = role.positions.map((p) => p.start).sort();
  const a = starts[0].slice(0, 4);
  if (role.positions.some((p) => !p.end)) return `${a}–Present`;
  const b = role.positions
    .map((p) => p.end!)
    .sort()
    .at(-1)!
    .slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}
