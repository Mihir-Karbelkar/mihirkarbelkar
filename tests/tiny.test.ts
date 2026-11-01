import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PreTrainedTokenizer } from '@huggingface/transformers';
import { TINY, thirdPerson, tinySources } from '../src/lib/tiny.ts';

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
    out,
    'SOURCE 1: A\nFirst chunk.\n\nSOURCE 2: A\nSecond chunk of a.\n\nSOURCE 3: B\nOnly chunk of b, where Mihir work.',
  );
  const long = 'x'.repeat(TINY.budget);
  assert.equal(tinySources([src('a', `${long} … more`)]), `SOURCE 1: A\n${long}`);
});
