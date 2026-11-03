import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PreTrainedTokenizer } from '@huggingface/transformers';
import { ONNX_MODELS, TINY, isOnnxModel, parseEvidence, quoteInSource, thirdPerson, tinySources } from '../src/lib/tiny.ts';

// ids from the Python tokenizers library Tiny 30M was trained with (tests/tiny-tokens.json)
test('the browser tokenizer matches the one Tiny 30M was trained with', () => {
  const json = JSON.parse(readFileSync(`public${TINY.tokenizer}`, 'utf8'));
  const tok = new PreTrainedTokenizer(json, { clean_up_tokenization_spaces: false });
  for (const { text, ids } of JSON.parse(readFileSync('tests/tiny-tokens.json', 'utf8'))) {
    assert.deepEqual(tok.encode(text, { add_special_tokens: false }), ids, text);
    assert.equal(tok.decode(ids, { skip_special_tokens: true }), text);
  }
});

test('first person becomes the name for the tiny model', () => {
  assert.equal(
    thirdPerson('I’ve worked on retrieval. I build tools and my notes help me. I\'m in Bengaluru.'),
    'Mihir has worked on retrieval. Mihir build tools and Mihir’s notes help Mihir. Mihir is in Bengaluru.',
  );
  assert.equal(thirdPerson('Images and items stay.'), 'Images and items stay.');
});

test('search results become numbered passages within the budget', () => {
  const src = (id: string, text: string) => ({ id, title: id.toUpperCase(), href: `/#${id}`, text });
  const out = tinySources([
    src('a', 'First chunk. … Second chunk of a.'),
    src('b', 'Only chunk of b, where I work.'),
    src('c', 'Never reached.'),
  ]);
  assert.equal(
    out.text,
    'SOURCE 1: A\nFirst chunk.\n\nSOURCE 2: A\nSecond chunk of a.\n\nSOURCE 3: B\nOnly chunk of b, where Mihir work.',
  );
  assert.deepEqual(out.sourceOf, [0, 0, 1]);
  const long = 'x'.repeat(TINY.budget);
  assert.equal(tinySources([src('a', `${long} … more`)]).text, `SOURCE 1: A\n${long}`);
});

test('evidence-first output parses as it streams', () => {
  const full = 'Source 2: "scaled to 100 robots"\nAnswer: It scaled to 100 robots.';
  for (let i = 1; i < full.indexOf('Answer:') + 7; i++)
    assert.ok(['pending', 'answer'].includes(parseEvidence(full.slice(0, i)).kind), full.slice(0, i));
  assert.deepEqual(parseEvidence(full), {
    kind: 'answer',
    source: 2,
    quote: 'scaled to 100 robots',
    answer: 'It scaled to 100 robots.',
  });
  assert.deepEqual(parseEvidence('Chat: Hi! Ask me anything.'), { kind: 'chat', answer: 'Hi! Ask me anything.' });
  assert.equal(parseEvidence('Ch').kind, 'pending');
  assert.equal(parseEvidence('Mihir is a software engineer').kind, 'malformed');
});

test('quotes are checked against the passage they cite', () => {
  const sources = 'SOURCE 1: A\nThe platform scaled to 100 robots.\n\nSOURCE 2: B\nI’ve used Pinecone.';
  assert.ok(quoteInSource(sources, 1, 'scaled to  100 robots'));
  assert.ok(quoteInSource(sources, 2, "I've used Pinecone"));
  assert.ok(!quoteInSource(sources, 2, 'scaled to 100 robots'), 'wrong passage');
  assert.ok(!quoteInSource(sources, 1, 'scaled to 4,000 robots'), 'not in the text');
  assert.ok(!quoteInSource(sources, 3, 'anything'), 'no such passage');
});

test('Ant 15M states follow its layer pattern and match the exported graph', () => {
  const ant = ONNX_MODELS['ant-15m'];
  // tiny-paraphraser's export (ant_export.py): kv per attention layer, conv + ssm per Mamba2 layer
  assert.equal(ant.states.length, 12);
  assert.deepEqual(ant.states.slice(0, 4).map((s) => s.input), ['kv0', 'conv1', 'ssm2', 'kv3']);
  assert.deepEqual(ant.states[0].shape, [2, 1, 2, 1, 64]);
  assert.deepEqual(ant.states[1].shape, [1, 768, 3]);
  assert.deepEqual(ant.states[2].shape, [1, 10, 64, 64]);
  assert.equal(ant.states[11].output, 'new_ssm11');
  assert.ok(isOnnxModel('ant-15m') && isOnnxModel('tiny-30m') && !isOnnxModel('qwen-0.5b'));
});
