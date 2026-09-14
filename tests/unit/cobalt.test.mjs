import assert from 'node:assert/strict';
import test from 'node:test';

const cobalt = await import('../../src/shared/cobalt.js').catch(() => null);

test('Cobalt helper exists for the web Save flow', () => {
  assert.ok(cobalt, 'src/shared/cobalt.js must implement the Cobalt web Save contract');
});

test('Cobalt request accepts public HTTPS media URLs and restricts options', () => {
  assert.ok(cobalt, 'Cobalt helper must exist before request behavior can be tested');
  const payload = cobalt.buildCobaltPayload({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    downloadMode: 'audio',
    audioFormat: 'wav',
    audioBitrate: '320',
    videoQuality: '720',
  });
  assert.deepEqual(payload, {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    downloadMode: 'audio',
    audioFormat: 'wav',
    audioBitrate: '320',
    videoQuality: '720',
    filenameStyle: 'pretty',
    localProcessing: 'disabled',
  });
  assert.throws(() => cobalt.buildCobaltPayload({ url: 'http://127.0.0.1/private' }), /public media URL/i);
  assert.throws(() => cobalt.buildCobaltPayload({ url: 'file:///etc/passwd' }), /HTTP or HTTPS/i);
  assert.equal(cobalt.buildCobaltPayload({ url: 'https://example.com/video', audioFormat: 'flac' }).audioFormat, 'mp3');
});

test('Cobalt response normalization supports download and picker results', () => {
  assert.ok(cobalt, 'Cobalt helper must exist before response behavior can be tested');
  assert.deepEqual(
    cobalt.normalizeCobaltResponse({ status: 'tunnel', url: 'https://cobalt.example/tunnel?id=1', filename: 'song.mp3' }),
    { status: 'tunnel', url: 'https://cobalt.example/tunnel?id=1', filename: 'song.mp3' },
  );
  assert.deepEqual(
    cobalt.normalizeCobaltResponse({
      status: 'picker',
      audio: 'https://cobalt.example/audio',
      audioFilename: 'audio.mp3',
      picker: [
        { type: 'photo', url: 'https://cdn.example/1.jpg', thumb: 'https://cdn.example/t1.jpg' },
        { type: 'video', url: 'https://cdn.example/2.mp4' },
      ],
    }),
    {
      status: 'picker',
      items: [
        { type: 'audio', url: 'https://cobalt.example/audio', filename: 'audio.mp3' },
        { type: 'photo', url: 'https://cdn.example/1.jpg', thumb: 'https://cdn.example/t1.jpg' },
        { type: 'video', url: 'https://cdn.example/2.mp4' },
      ],
    },
  );
  assert.throws(() => cobalt.normalizeCobaltResponse({ status: 'local-processing' }), /local processing.*disabled/i);
  assert.throws(() => cobalt.normalizeCobaltResponse({ status: 'error', error: { code: 'error.api.youtube.login' } }), /error\.api\.youtube\.login/);
});
