import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackgroundStreamUrl,
  createBackgroundAudioPlayerClass,
  PLAYER_STATES,
} from '../../src/music/backgroundAudioPlayer.js';

test('buildBackgroundStreamUrl creates a same-origin stream URL for a YouTube id', () => {
  assert.equal(buildBackgroundStreamUrl('dQw4w9WgXcQ'), '/api/audio-stream?id=dQw4w9WgXcQ');
});

test('buildBackgroundStreamUrl rejects malformed ids', () => {
  assert.throws(() => buildBackgroundStreamUrl('../bad?id=1'), /video id/i);
});

test('background player maps load/play/pause/seek/volume to one HTML audio element', async () => {
  const events = [];
  const audio = {
    src: '',
    preload: '',
    playsInline: false,
    volume: 1,
    muted: false,
    currentTime: 0,
    duration: 123,
    ended: false,
    paused: true,
    listeners: new Map(),
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    remove() {},
    loadCalled: 0,
    load() { this.loadCalled += 1; },
    async play() { this.paused = false; this.listeners.get('play')?.(); },
    pause() { this.paused = true; this.listeners.get('pause')?.(); },
  };
  const target = { appendChild(node) { assert.equal(node, audio); } };
  const document = {
    createElement(tag) { assert.equal(tag, 'audio'); return audio; },
    getElementById(id) { assert.equal(id, 'player'); return target; },
  };
  const Player = createBackgroundAudioPlayerClass({ document, queueMicrotask: (fn) => fn() });
  const player = new Player('player', {
    events: {
      onReady: () => events.push('ready'),
      onStateChange: ({ data }) => events.push(data),
    },
  });

  player.loadVideoById('dQw4w9WgXcQ');
  assert.equal(audio.src, '/api/audio-stream?id=dQw4w9WgXcQ');
  assert.equal(audio.preload, 'auto');
  assert.equal(audio.playsInline, true);
  assert.equal(audio.loadCalled, 1);
  assert.equal(player.getPlayerState(), PLAYER_STATES.PLAYING);

  player.setVolume(35);
  assert.equal(audio.volume, 0.35);
  player.mute();
  assert.equal(audio.muted, true);
  player.unMute();
  assert.equal(audio.muted, false);
  player.seekTo(44);
  assert.equal(audio.currentTime, 44);
  assert.equal(player.getCurrentTime(), 44);
  assert.equal(player.getDuration(), 123);

  player.pauseVideo();
  assert.equal(player.getPlayerState(), PLAYER_STATES.PAUSED);
  assert.ok(events.includes('ready'));
  assert.ok(events.includes(PLAYER_STATES.BUFFERING));
  assert.ok(events.includes(PLAYER_STATES.PLAYING));
  assert.ok(events.includes(PLAYER_STATES.PAUSED));
});

test('background player reports a useful relay playback error', async () => {
  const messages = [];
  const audio = {
    src: '',
    preload: '',
    playsInline: false,
    volume: 1,
    muted: false,
    currentTime: 0,
    duration: 0,
    ended: false,
    listeners: new Map(),
    addEventListener(name, fn) { this.listeners.set(name, fn); },
    remove() {},
    load() {},
    play() { return Promise.reject(new DOMException('play() failed', 'NotSupportedError')); },
    pause() {},
  };
  const document = {
    createElement() { return audio; },
    getElementById() { return { appendChild() {} }; },
  };
  const Player = createBackgroundAudioPlayerClass({ document, queueMicrotask: (fn) => fn() });
  const player = new Player('player', {
    events: { onError: ({ message }) => messages.push(message) },
  });

  player.loadVideoById('dQw4w9WgXcQ');
  await Promise.resolve();
  await Promise.resolve();
  assert.match(messages[0], /background audio|stream|playback/i);
  assert.doesNotMatch(messages[0], /embedded YouTube player/i);
});
