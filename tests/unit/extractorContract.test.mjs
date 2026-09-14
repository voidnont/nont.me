import assert from 'node:assert/strict';
import test from 'node:test';

const contract = await import('../../src/shared/extractorContract.js').catch(() => null);

test('extractor contract module exists', () => {
  assert.ok(contract, 'src/shared/extractorContract.js must exist');
});

test('extraction request normalizes supported options', () => {
  assert.ok(contract);
  assert.deepEqual(contract.buildExtractionRequest({
    url: 'https://www.youtube.com/watch?v=abc123xyz00',
    downloadMode: 'audio',
    audioFormat: 'wav',
    audioBitrate: '320',
    videoQuality: '720',
  }), {
    url: 'https://www.youtube.com/watch?v=abc123xyz00',
    downloadMode: 'audio',
    audioFormat: 'wav',
    audioBitrate: '320',
    videoQuality: '720',
  });

  const defaults = contract.buildExtractionRequest({ url: 'http://example.com/media' });
  assert.equal(defaults.downloadMode, 'audio');
  assert.equal(defaults.audioFormat, 'mp3');
  assert.equal(defaults.audioBitrate, '320');
  assert.equal(defaults.videoQuality, '1080');
});

test('extraction request rejects unsafe and non-web targets', () => {
  assert.ok(contract);
  assert.throws(() => contract.buildExtractionRequest({ url: 'file:///etc/passwd' }), /HTTP or HTTPS/i);
  assert.throws(() => contract.buildExtractionRequest({ url: 'http://localhost/private' }), /public media URL/i);
  assert.throws(() => contract.buildExtractionRequest({ url: 'http://127.0.0.1/private' }), /public media URL/i);
  assert.throws(() => contract.buildExtractionRequest({ url: 'http://10.0.0.8/private' }), /public media URL/i);
  assert.throws(() => contract.buildExtractionRequest({ url: 'http://169.254.1.2/private' }), /public media URL/i);
});

test('worker result normalizer preserves ready, picker, challenge and error results', () => {
  assert.ok(contract);
  assert.deepEqual(contract.normalizeWorkerResult({
    status: 'ready',
    url: 'https://cdn.example/song.m4a',
    filename: 'song.m4a',
    mime: 'audio/mp4',
    extractor: 'innertube',
  }), {
    status: 'ready',
    url: 'https://cdn.example/song.m4a',
    filename: 'song.m4a',
    mime: 'audio/mp4',
    extractor: 'innertube',
  });

  assert.deepEqual(contract.normalizeWorkerResult({
    status: 'picker',
    extractor: 'yt-dlp',
    items: [{ url: 'https://cdn.example/a.mp4', filename: 'a.mp4', type: 'video' }],
  }), {
    status: 'picker',
    extractor: 'yt-dlp',
    items: [{ url: 'https://cdn.example/a.mp4', filename: 'a.mp4', type: 'video' }],
  });

  assert.deepEqual(contract.normalizeWorkerResult({
    status: 'challenge',
    challenge: 'captcha_required',
    message: 'Please complete the CAPTCHA on the source site.',
    sourceUrl: 'https://example.com/watch/1',
    extractor: 'yt-dlp',
  }), {
    status: 'challenge',
    challenge: 'captcha_required',
    message: 'Please complete the CAPTCHA on the source site.',
    sourceUrl: 'https://example.com/watch/1',
    extractor: 'yt-dlp',
  });

  assert.deepEqual(contract.normalizeWorkerResult({
    status: 'error',
    message: 'No direct media was found.',
    sourceUrl: 'https://example.com/watch/1',
    extractor: 'yt-dlp',
  }), {
    status: 'error',
    message: 'No direct media was found.',
    sourceUrl: 'https://example.com/watch/1',
    extractor: 'yt-dlp',
  });
});

test('worker result normalizer rejects unknown challenge codes, old fallback status and unsafe result URLs', () => {
  assert.ok(contract);
  assert.throws(() => contract.normalizeWorkerResult({ status: 'challenge', challenge: 'solve_automatically' }), /challenge/i);
  assert.throws(() => contract.normalizeWorkerResult({ status: 'fallback', reason: 'unsupported' }), /unsupported response/i);
  assert.throws(() => contract.normalizeWorkerResult({ status: 'ready', url: 'file:///tmp/a' }), /HTTP or HTTPS/i);
});
