import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/audio-stream.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    chunks: [],
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    redirect(code, url) { this.statusCode = code; this.headers.location = url; return this; },
    write(value) { this.chunks.push(Buffer.from(value)); return true; },
    end(value) { if (value) this.write(value); this.ended = true; return this; },
  };
}

test('audio stream endpoint rejects malformed video ids before calling worker', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not run'); };
  try {
    const res = createResponse();
    await handler({ method: 'GET', query: { id: '../bad' }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
    assert.match(res.body.error, /video id/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('audio stream endpoint relays partial media without redirecting', async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.EXTRACTOR_WORKER_URL;
  const oldToken = process.env.EXTRACTOR_WORKER_TOKEN;
  process.env.EXTRACTOR_WORKER_URL = 'https://worker.example.test';
  process.env.EXTRACTOR_WORKER_TOKEN = 'secret';
  let request;
  const chunks = [Buffer.from('abc'), Buffer.from('def')];
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 206,
      headers: new Headers({
        'content-type': 'audio/webm',
        'content-range': 'bytes 10-15/100',
        'accept-ranges': 'bytes',
        'content-length': '6',
      }),
      body: { async *[Symbol.asyncIterator]() { yield* chunks; } },
    };
  };
  try {
    const req = { method: 'GET', query: { id: 'dQw4w9WgXcQ' }, headers: { range: 'bytes=10-15' } };
    const res = createResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers.location, undefined);
    assert.equal(res.headers['content-range'], 'bytes 10-15/100');
    assert.equal(res.headers['content-type'], 'audio/webm');
    assert.equal(Buffer.concat(res.chunks).toString(), 'abcdef');
    assert.equal(res.ended, true);
    assert.equal(request.url, 'https://worker.example.test/stream/dQw4w9WgXcQ');
    assert.equal(request.options.headers.Authorization, 'Bearer secret');
    assert.equal(request.options.headers.Range, 'bytes=10-15');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.EXTRACTOR_WORKER_URL; else process.env.EXTRACTOR_WORKER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.EXTRACTOR_WORKER_TOKEN; else process.env.EXTRACTOR_WORKER_TOKEN = oldToken;
  }
});
