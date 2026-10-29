import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../src/lib/intent.ts';
import { projects, site } from '../src/data/portfolio.ts';

const ctx = { sections: site.chat.sections, projects };
const target = (q: string) => {
  const i = routeIntent(q, ctx);
  return i.kind === 'navigate' ? i.target : i.kind;
};
test('navigation requests scroll instead of generating', () => {
  const cases: [string, string][] = [
    ['Show me Superstocks', '#project-public-markets-agents'],
    ['show me superstocks.ai', '#project-public-markets-agents'],
    ['Take me to the Experimental Brain', '#project-experimental-brain'],
    ['open prompt studio', '#project-prompt-studio'],
    ['projects', '#work'],
    ['Show me your work', '#work'],
    ['contact', '#contact'],
    ['How can I contact you?', 'answer'],
    ['Where is the about section?', '#about'],
    ['tech stack', '#skills'],
    ['go to notes', '#notes'],
  ];
  for (const [q, want] of cases) assert.equal(target(q), want, q);
});
test('questions and tours', () => {
  for (const q of [
    'How did the robot fleet scale?',
    'What’s the tech stack?',
    'What did you build at Superstocks with Pinecone?',
    'what is LoRA',
    '',
  ])
    assert.equal(target(q), 'answer', q);
  assert.equal(target('Show me around'), 'tour');
  assert.equal(target('can you give me a tour?'), 'tour');
});
test('theme commands are actions, theme questions are not', () => {
  const action = (q: string) => {
    const i = routeIntent(q, ctx);
    return i.kind === 'action' ? i.action : i.kind;
  };
  assert.equal(action('Change to light mode'), 'theme-light');
  assert.equal(action('dark mode please'), 'theme-dark');
  assert.equal(action('turn off dark mode'), 'theme-light');
  assert.equal(action('switch to night mode'), 'theme-dark');
  assert.equal(action('How did you build the dark mode?'), 'answer');
});
import { buildExemplars, routeByExample } from '../src/lib/router.ts';
test('semantic router picks a confident, unambiguous action only', () => {
  const ex = buildExemplars(site.chat.actions);
  assert.equal(ex.texts.length, ex.actions.length);
  // Fake 3-d embeddings: light, dark, tour directions.
  const dir = {
    'theme-light': [1, 0, 0],
    'theme-dark': [0, 1, 0],
    tour: [0, 0, 1],
    top: [0.6, 0, 0.8],
  } as const;
  const vectors = ex.actions.map((a) => dir[a]);
  assert.equal(
    routeByExample('make it bright', [0.95, 0.31, 0], ex, vectors),
    'theme-light',
  );
  assert.equal(
    routeByExample('hmm', [0.7, 0.7, 0.14], ex, vectors),
    null,
    'ambiguous',
  );
  assert.equal(
    routeByExample('qwen?', [0.3, 0.3, 0.3], ex, vectors),
    null,
    'too weak',
  );
  assert.equal(
    routeByExample('How does dark mode work', [0, 1, 0], ex, vectors),
    null,
    'questions go to the LLM',
  );
});
test('career keywords scroll to the timeline', () => {
  assert.equal(target('experience'), '#career');
  assert.equal(target('show me your career'), '#career');
});
