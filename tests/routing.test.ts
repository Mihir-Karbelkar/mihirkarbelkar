import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subdomainPath } from '../src/middleware.ts';
import { readJSON, protect } from '../src/lib/server.ts';
import { readFileSync } from 'node:fs';
test('subdomain rewriting excludes preview hosts, APIs, assets and repeated prefixes', () => {
  assert.equal(subdomainPath('mihirkarbelkar.com', '/'), null);
  assert.equal(subdomainPath('portfolio-preview.workers.dev', '/'), null);
  assert.equal(
    subdomainPath('tech.mihirkarbelkar.com', '/blog/post'),
    '/tech/blog/post',
  );
  assert.equal(
    subdomainPath('tech.mihirkarbelkar.com', '/tech/blog/post'),
    null,
  );
  assert.equal(subdomainPath('tech.mihirkarbelkar.com', '/api/chat'), null);
  assert.equal(
    subdomainPath('tech.mihirkarbelkar.com', '/fonts/example.woff'),
    null,
  );
});
test('JSON reader bounds bodies independently of Content-Length', async () => {
  const request = new Request('https://example.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(50) }),
  });
  await assert.rejects(() => readJSON(request, 20), /too large/);
});
test('shared rate limiter rejects traffic without calling inference', async () => {
  const context = {
    request: new Request('https://example.com/api/chat', {
      headers: {
        Origin: 'https://example.com',
        'CF-Connecting-IP': '127.0.0.1',
      },
    }),
    url: new URL('https://example.com/api/chat'),
  } as any;
  const rejected = await protect(context, {
    API_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(rejected?.status, 429);
});
test('recordings include real model revision and 1024 finite embedding dimensions', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../public/lab/recordings.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(Object.keys(manifest).length, 3);
  for (const path of Object.values(manifest) as string[]) {
    const data = JSON.parse(
      readFileSync(new URL('../public' + path, import.meta.url), 'utf8'),
    );
    assert.match(data.provenance.revision, /^[a-f0-9]{40}$/);
    assert.equal(data.result.mode, 'recorded');
    assert.equal(data.result.embedding.length, 1024);
    assert.ok(data.result.embedding.every(Number.isFinite));
    assert.ok(data.provenance.source.includes('SHA256'));
  }
});
