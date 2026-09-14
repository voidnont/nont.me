const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

export const PLAYER_STATES = Object.freeze({
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
});

export function buildBackgroundStreamUrl(videoId) {
  const id = String(videoId || '').trim();
  if (!VIDEO_ID_RE.test(id)) throw new Error('Invalid YouTube video id.');
  return `/api/audio-stream?id=${encodeURIComponent(id)}`;
}

export function describePlaybackError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError') return 'Tap Play again to allow FRXE background audio playback.';
  if (name === 'NotSupportedError') return 'FRXE could not play this background audio stream.';
  return 'FRXE background audio playback failed. Try this track again.';
}

function safeCall(fn, payload) {
  if (typeof fn !== 'function') return;
  try { fn(payload); } catch { /* consumer callback */ }
}

function mediaSessionState(value) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = value; } catch { /* unsupported */ }
}

export function createBackgroundAudioPlayerClass({ document, queueMicrotask = globalThis.queueMicrotask } = globalThis) {
  return class FrxeBackgroundAudioPlayer {
    constructor(targetId, options = {}) {
      this.options = options;
      this.state = PLAYER_STATES.UNSTARTED;
      this.destroyed = false;
      this.audio = document.createElement('audio');
      this.audio.preload = 'auto';
      this.audio.playsInline = true;
      this.audio.setAttribute?.('playsinline', '');
      this.audio.setAttribute?.('webkit-playsinline', '');

      const target = document.getElementById(targetId);
      if (!target) throw new Error(`Background audio target "${targetId}" was not found.`);
      target.appendChild(this.audio);

      this.onPlay = () => {
        this.setState(PLAYER_STATES.PLAYING);
        mediaSessionState('playing');
      };
      this.onPause = () => {
        if (this.audio.ended || this.destroyed) return;
        this.setState(PLAYER_STATES.PAUSED);
        mediaSessionState('paused');
      };
      this.onWaiting = () => this.setState(PLAYER_STATES.BUFFERING);
      this.onEnded = () => {
        this.setState(PLAYER_STATES.ENDED);
        mediaSessionState('none');
      };
      this.onError = (event) => {
        mediaSessionState('paused');
        safeCall(this.options.events?.onError, {
          target: this,
          data: event,
          message: describePlaybackError(event),
        });
      };

      this.audio.addEventListener('play', this.onPlay);
      this.audio.addEventListener('pause', this.onPause);
      this.audio.addEventListener('waiting', this.onWaiting);
      this.audio.addEventListener('stalled', this.onWaiting);
      this.audio.addEventListener('ended', this.onEnded);
      this.audio.addEventListener('error', this.onError);

      const ready = () => {
        if (!this.destroyed) safeCall(this.options.events?.onReady, { target: this });
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(ready);
      else Promise.resolve().then(ready);
    }

    setState(state) {
      if (this.destroyed || this.state === state) return;
      this.state = state;
      safeCall(this.options.events?.onStateChange, { target: this, data: state });
    }

    loadVideoById(videoId) {
      if (this.destroyed) return;
      this.audio.src = buildBackgroundStreamUrl(videoId);
      this.setState(PLAYER_STATES.BUFFERING);
      this.audio.load();
      this.playVideo();
    }

    playVideo() {
      if (this.destroyed) return;
      const result = this.audio.play();
      if (result?.catch) result.catch((error) => this.onError(error));
    }

    pauseVideo() {
      if (this.destroyed) return;
      this.audio.pause();
    }

    setVolume(value) {
      const normalized = Math.max(0, Math.min(100, Number(value) || 0));
      this.audio.volume = normalized / 100;
    }

    mute() { this.audio.muted = true; }
    unMute() { this.audio.muted = false; }
    getCurrentTime() { return Number(this.audio.currentTime || 0); }
    getDuration() { return Number.isFinite(this.audio.duration) ? Number(this.audio.duration) : 0; }
    getPlayerState() { return this.state; }

    seekTo(value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) this.audio.currentTime = seconds;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      try { this.audio.pause(); } catch { /* no-op */ }
      this.audio.removeEventListener?.('play', this.onPlay);
      this.audio.removeEventListener?.('pause', this.onPause);
      this.audio.removeEventListener?.('waiting', this.onWaiting);
      this.audio.removeEventListener?.('stalled', this.onWaiting);
      this.audio.removeEventListener?.('ended', this.onEnded);
      this.audio.removeEventListener?.('error', this.onError);
      this.audio.removeAttribute?.('src');
      try { this.audio.load(); } catch { /* no-op */ }
      this.audio.remove?.();
      mediaSessionState('none');
    }
  };
}

export function installBackgroundAudioPlayer(win = window, doc = document) {
  const Player = createBackgroundAudioPlayerClass({ document: doc, queueMicrotask: win.queueMicrotask?.bind(win) });
  win.YT = {
    ...(win.YT || {}),
    Player,
    PlayerState: PLAYER_STATES,
    __frxeBackgroundAudio: true,
  };
  return win.YT;
}
