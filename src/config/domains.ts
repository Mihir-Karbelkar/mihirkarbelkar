export interface DomainConfig {
    tagline: string;
    pages: string[];
}

export type DomainConfigs = Record<string, DomainConfig>;

export const domainConfig: DomainConfigs = {
    tech: {
        tagline: "Code should sprint like I do.",
        pages: ['Posts', 'Lab', 'Snippets', 'Philosophy'],
    },
    politics: {
        tagline: "Informed dissent is self-respect.",
        pages: ['Essays', 'Commentary', 'Manifesto', 'Resources'],
    },
    fit: {
        tagline: "Strength through consistency.",
        pages: ['Workouts', 'Nutrition', 'Progress', 'Philosophy'],
    },
    '': {
        tagline: "",
        pages: [],
    }
}; 