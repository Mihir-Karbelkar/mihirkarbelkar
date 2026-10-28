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
