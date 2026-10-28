export interface Project {
  slug: string;
  title: string;
  category: string;
  summary: string;
  problem: string;
  approach: string[];
  outcome: string;
  metric: string;
  metricLabel: string;
  tags: string[];
  tone: 'lavender' | 'mint' | 'peach' | 'blue';
  status: string;
  source?: string;
  kind: 'professional' | 'experiment' | 'project';
  reflection?: string;
}
export const profile = {
  name: 'Mihir Karbelkar',
  location: 'Bengaluru, India',
  title: 'Software engineer',
  description:
    'I’m Mihir, a software engineer in Bengaluru. I build software, experiment with AI, and write about the ideas I want to understand.',
  github: 'https://github.com/Mihir-Karbelkar',
  maths: 'https://github.com/Mihir-Karbelkar/maths',
  email: import.meta.env?.PUBLIC_CONTACT_EMAIL || '',
  linkedin: import.meta.env?.PUBLIC_LINKEDIN_URL || '',
  calendar: import.meta.env?.PUBLIC_CALENDAR_URL || '',
};
export const home = {
  eyebrow: 'Engineering / AI / Things I’m curious about',
  headline: ['I like figuring things out.', 'Then building something with it.'],
  body: 'I’m Mihir. I build software, experiment with AI, and occasionally end up making something for my room. I like understanding how things work, down to the details.',
  supporting: 'Software, models, maths, and the occasional physical thing.',
  workHeading: 'A few things I’ve worked on.',
  about: [
    'I’ve spent much of my time building interfaces and making software faster. I also keep finding reasons to go further down the stack: into models, the maths behind them, and sometimes the hardware they run on.',
    'I like being able to take an idea apart, understand the pieces, and build something with them. That’s what connects most of the work here.',
  ],
  contactHeading: 'Have something in mind?',
  contactBody: 'Tell me what you’re working on. I’d like to hear about it.',
};
export const interests = [
  {
    title: 'Smaller models. Deeper questions.',
    label: 'Qwen / fine-tuning',
    href: '/projects/qwen-fine-tuning',
    art: 'model',
    tone: 'lavender',
  },
  {
    title: 'A glimpse, an action, a possibility.',
    label: 'The Brain / experiments',
    href: '/lab/brain',
    art: 'brain',
    tone: 'sage',
  },
  {
    title: 'Back to first principles.',
    label: 'Maths / notes',
    href: profile.maths,
    art: 'maths',
    tone: 'blue',
  },
] as const;
export const projects: Project[] = [
  {
    slug: 'public-markets-agents',
    title: 'Superstocks.ai',
    category: 'Software / public-markets research',
    summary: 'Making messy information easier to work with.',
    problem:
      'Public-markets research brings together structured data, screening and longer analysis. I’m interested in how AI can help turn that material into something I can query and work through.',
    approach: [
      'I’ve worked on guarded SQL agents and screening workflows around research data.',
      'I’ve connected multi-agent analysis workflows with ClickHouse analytics.',
      'I’ve also worked with retrieval pipelines using Pinecone to bring research context into the workflow.',
    ],
    outcome:
      'I work across research tools, retrieval and structured queries, bringing the source material and the analysis into the same workflow.',
    reflection:
      'I keep the source material, the query and the generated interpretation distinct. A well-written answer is easier to assess when I can see what it was based on.',
    metric: 'SQL + retrieval',
    metricLabel: 'Research workflows',
    tags: ['Python', 'SQL agents', 'ClickHouse', 'Pinecone'],
    tone: 'blue',
    status: 'Professional work',
    kind: 'professional',
  },
  {
    slug: 'experimental-brain',
    title: 'Experimental Brain',
    category: 'Experiment / perception and action',
    summary:
      'Connecting what a model observes with what a small actor does next.',
    problem:
      'I wanted a way to inspect the gap between an observation, an action and a language model’s description of what might happen next.',
    approach: [
      'I connected a V-JEPA 2 encoder to short video samples and recorded the resulting embeddings with their model revision and preprocessing details.',
      'I built a small grid simulation with an explicit rule-based policy. Motion allows a step; a path planner chooses a route around an obstacle.',
      'I kept the optional LLM narration separate from perception and control. I can step through the actor and export a trace of the run.',
    ],
    outcome:
      'The site includes real recorded V-JEPA outputs and a separate live-perception service. The browser can replay recordings without downloading the encoder. Live perception requires a configured service; the actor is a demonstration, not a trained robotics policy.',
    reflection:
      'A similarity score is not a confidence estimate, and a plausible narration is not an observation. I make those distinctions visible in the experiment.',
    metric: 'Observe / act / dream',
    metricLabel: 'An inspectable experiment',
    tags: ['V-JEPA 2', 'Python', 'Simulation', 'Local models'],
    tone: 'mint',
    status: 'Experiment',
    kind: 'experiment',
    source: '/lab/brain',
  },
  {
    slug: 'qwen-fine-tuning',
    title: 'Qwen fine-tuning',
    category: 'Experiment / model learning',
    summary:
      'Looking at what changes when I fine-tune a model—and how I check it.',
    problem:
      'I’ve been working with Qwen fine-tuning to explore how a model learns from source material. The question extends beyond training loss: I want to know whether its answers are supported and whether it retains other capabilities.',
    approach: [
      'I’ve worked with LoRA adapters rather than updating every model weight.',
      'I’ve kept source-specific training examples separate from general examples, with answer-token losses and isolated sequence packing.',
      'I’ve used held-out questions and source-based answer reviews alongside training logs. I’ve also explored regularization against the base model’s responses.',
    ],
    outcome:
      'I’m comparing training choices with answer reviews on held-out questions. This is an experiment in training and evaluation. The browser playground on this site uses a separate, unmodified pretrained Qwen model.',
    reflection:
      'A lower loss and a better answer are different checks. Source-word overlap can help me inspect an answer, but it cannot establish that the answer addresses the question.',
    metric: 'LoRA + evaluation',
    metricLabel: 'Training and answer checks',
    tags: ['Qwen', 'LoRA', 'PyTorch', 'Evaluation'],
    tone: 'lavender',
    status: 'Experiment',
    kind: 'experiment',
  },
  {
    slug: 'robot-fleet',
    title: 'Robot fleet scaling',
    category: 'Platform work / Ati Motors',
    summary: 'Supporting more concurrent robots on the same hardware.',
    problem:
      'The fleet platform needed to handle more concurrent robots without a corresponding hardware increase.',
    approach: [
      'I worked on backend performance and platform scaling for robot fleets.',
      'I focused on bottlenecks and resource use while supporting concurrent robot workloads.',
    ],
    outcome:
      'The platform scaled from approximately 8–10 to 100 concurrent robots on the same hardware.',
    metric: '100 robots',
    metricLabel: 'Concurrent, on the same hardware',
    tags: ['Backend', 'Performance', 'Robotics'],
    tone: 'peach',
    status: 'Professional work',
    kind: 'professional',
  },
  {
    slug: 'high-scale-platforms',
    title: 'Frontend performance & scale',
    category: 'Frontend and platform work / payments',
    summary: 'Working on interfaces, bundle size and high-traffic software.',
    problem:
      'I worked on product surfaces that needed to load efficiently while supporting substantial daily traffic.',
    approach: [
      'I supported systems serving over 900,000 bill views per day.',
      'I contributed frontend performance work that reduced bundle size by 90%.',
      'I helped achieve 99.98% availability through production engineering work.',
    ],
    outcome:
      'These are separate outcomes across the work: 900,000+ daily bill views supported, a 90% frontend bundle reduction and contributions to 99.98% availability.',
    metric: '90% smaller',
    metricLabel: 'Frontend bundle size',
    tags: ['React', 'TypeScript', 'Performance', 'Observability'],
    tone: 'mint',
    status: 'Professional work',
    kind: 'professional',
  },
  {
    slug: 'production-rag',
    title: 'Research retrieval pipelines',
    category: 'Software / retrieval',
    summary: 'Bringing source context into research workflows.',
    problem:
      'I’ve worked on connecting language models to research material using retrieval. That includes the movement of data through indexing, search and downstream analysis.',
    approach: [
      'I’ve used Pinecone for vector retrieval in RAG workflows.',
      'I’ve connected retrieved context to analysis pipelines.',
      'I’ve worked across the backend, deployment and monitoring parts of those workflows.',
    ],
    outcome:
      'This work connects vector search with the backend and analysis workflows that consume the retrieved material.',
    metric: 'Pinecone + RAG',
    metricLabel: 'Research context and retrieval',
    tags: ['RAG', 'Pinecone', 'Python', 'Analytics'],
    tone: 'mint',
    status: 'Professional work',
    kind: 'professional',
  },
  {
    slug: 'prompt-studio',
    title: 'Prompt Studio',
    category: 'Software / public project',
    summary:
      'A writing assistant with streamed responses and conversation controls.',
    problem:
      'I wanted a chat interface that could handle technical writing, including code, tables and longer responses.',
    approach: [
      'I built around Next.js, TypeScript, shadcn/ui and the AI SDK.',
      'The public repository documents streamed Markdown, conversation history and responsive navigation.',
      'The interface includes stop, regenerate and copy controls.',
    ],
    outcome:
      'The source is available on GitHub. I haven’t published usage or adoption figures.',
    metric: 'Streaming chat',
    metricLabel: 'A public software project',
    tags: ['Next.js', 'TypeScript', 'shadcn/ui', 'AI SDK'],
    tone: 'lavender',
    status: 'Public project',
    kind: 'project',
    source: 'https://github.com/Mihir-Karbelkar/prompt-studio',
  },
];
export const featuredSlugs = [
  'public-markets-agents',
  'experimental-brain',
  'qwen-fine-tuning',
];
export const archiveSlugs = [
  'high-scale-platforms',
  'robot-fleet',
  'production-rag',
  'prompt-studio',
];
// The assistant remains in the lab. These are source facts, not a homepage services pitch.
export const services = [
  [
    '01',
    'How I work',
    'I work across interfaces, performance, backend platforms and model experiments. I prefer to understand the problem and its constraints before choosing an approach.',
  ],
];
export const skills = [
  ['Interfaces', 'React · TypeScript · Next.js · React Native'],
  ['Backend & data', 'Go · Python · FastAPI · PostgreSQL · Redis · ClickHouse'],
  ['Models & retrieval', 'LoRA · Qwen · RAG · Pinecone · SQL agents'],
  ['Infrastructure', 'Kubernetes · Docker · CI/CD · Observability'],
];
export const experience = [
  [
    'SOFTWARE',
    'Frontend & performance',
    'I’ve worked on interfaces, frontend bundles and high-traffic product surfaces.',
  ],
  [
    'PLATFORMS',
    'Ati Motors',
    'I worked on robot fleet scaling, from approximately 8–10 to 100 concurrent robots on the same hardware.',
  ],
  [
    'RESEARCH TOOLS',
    'Public markets',
    'I’ve worked on SQL agents, screeners, analysis and retrieval workflows.',
  ],
];
export const notes = [
  {
    title: 'Maths, from the ground up',
    summary: 'Writing my way through the ideas I want to understand.',
    detail:
      'I start with statements, logical connectives and proof, using definitions and worked examples. The outline includes the topics I want to work through next.',
    href: profile.maths,
    label: 'Maths notebook',
    external: true,
  },
  {
    title: 'Logic and mathematical proof',
    summary:
      'Starting with what a statement says—and the domain it says it about.',
    detail:
      'A chapter from my maths notebook, with definitions and worked examples.',
    href: 'https://github.com/Mihir-Karbelkar/maths/blob/main/part-1-foundations/01-logic-and-proof.md',
    label: 'Read the chapter',
    external: true,
  },
];
