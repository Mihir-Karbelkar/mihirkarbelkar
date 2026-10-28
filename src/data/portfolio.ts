// Content lives in the JSON files beside this module; edit those, not this file.
import siteJson from './site.json' with { type: 'json' };
import projectsJson from './projects.json' with { type: 'json' };
import notesJson from './notes.json' with { type: 'json' };
import skillsJson from './skills.json' with { type: 'json' };
import {
  notesSchema,
  projectsSchema,
  siteSchema,
  skillsSchema,
} from './schema.ts';
export type { Project, Artwork } from './schema.ts';
export const site = siteSchema.parse(siteJson);
const projectData = projectsSchema.parse(projectsJson);
export const profile = {
  ...site.profile,
  email: import.meta.env?.PUBLIC_CONTACT_EMAIL || '',
  linkedin: import.meta.env?.PUBLIC_LINKEDIN_URL || '',
  calendar: import.meta.env?.PUBLIC_CALENDAR_URL || '',
};
export const home = site.home;
export const projects = projectData.items;
export const featuredSlugs = projectData.featured;
export const archiveSlugs = projectData.archive;
export const notes = notesSchema.parse(notesJson);
export const { services, skills, experience } = skillsSchema.parse(skillsJson);
