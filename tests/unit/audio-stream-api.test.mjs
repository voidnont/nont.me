import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/audio-stream.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    redirect(code, url) { this.statusCode = code; this.headers.location = url; return this; },
  };
}

test('audio stream endpoint rejects malformed video ids before calling worker', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not run'); };
  try {
    const res = createResponse();
    await handler({ method: 'GET', query: { id: '../bad' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
    assert.match(res.body.error, /video id/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('audio stream endpoint redirects an extracted audio URL', async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.EXTRACTOR_WORKER_URL;
  const oldToken = process.env.EXTRACTOR_WORKER_TOKEN;
  process.env.EXTRACTOR_WORKER_URL = 'https://worker.example.test';
  process.env.EXTRACTOR_WORKER_TOKEN = 'secret';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { status: 'ready', type: 'audio', url: 'https://media.example.test/audio.webm', mime: 'audio/webm', extractor: 'innertube' };
      },
    };
  };
  try {
    const res = createResponse();
    await handler({ method: 'GET', query: { id: 'dQw4w9WgXcQ' } }, res);
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, 'https://media.example.test/audio.webm');
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.equal(request.url, 'https://worker.example.test/extract');
    assert.equal(request.options.headers.Authorization, 'Bearer secret');
    const body = JSON.parse(request.options.body);
    assert.equal(body.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(body.downloadMode, 'audio');
    assert.equal(body.audioFormat, 'best');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.EXTRACTOR_WORKER_URL; else process.env.EXTRACTOR_WORKER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.EXTRACTOR_WORKER_TOKEN; else process.env.EXTRACTOR_WORKER_TOKEN = oldToken;
  }
});
