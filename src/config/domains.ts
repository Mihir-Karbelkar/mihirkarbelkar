export interface DomainConfig {
  tagline: string;
  pages: string[];
}

export type DomainConfigs = Record<string, DomainConfig>;

const defaultConfig: DomainConfig = {
  tagline: "Subdomain salad",
  pages: [],
};

export const domainConfig: DomainConfigs = {
  tech: {
    tagline: "Code should sprint like I do.",
    pages: ["Posts", "Lab", "Snippets", "Philosophy"],
  },
  politics: {
    tagline: "Informed dissent is self-respect.",
    pages: ["Essays", "Commentary", "Manifesto", "Resources"],
  },
  fit: {
    tagline: "Strength through consistency.",
    pages: ["Workouts", "Nutrition", "Progress", "Philosophy"],
  },
  puns: {
    tagline: "Some of these dont even make sense.",
    pages: ["Punchlines", "Categories", "Submissions", "About"],
  },
  Localhost: defaultConfig,
};

export function getDomainConfig(domain: string): DomainConfig {
  return domainConfig[domain] || defaultConfig;
}
