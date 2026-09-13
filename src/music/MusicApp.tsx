import {
  ArrowDown,
  Cast,
  ChevronDown,
  Download,
  ExternalLink,
  Heart,
  Home,
  Library,
  ListMusic,
  Loader2,
  Mic,
  Music2,
  Pause,
  Play,
  Repeat2,
  Search as SearchIcon,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { mergeAndRankMusicResults, refineMusicMetadata } from '../shared/musicSearch.js';

type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: string | null;
  publishedAt?: string | null;
  official?: boolean;
  topic?: boolean;
  vevo?: boolean;
};

type FrxeTab = 'home' | 'search' | 'save' | 'library' | 'settings';
type RepeatMode = 'off' | 'queue' | 'track';
type GlassMode = 'liquid' | 'soft' | 'minimal';
type PlayerSettings = {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  motion: boolean;
  glass: GlassMode;
};

const FRXE_REPO = 'https://github.com/voidnont/Frxe';
const FRXE_SOURCE_VERSION = '0.4.6';
const LIBRARY_KEY = 'frxe.web.library.v1';
const HISTORY_KEY = 'frxe.web.history.v1';
const PLAYER_SETTINGS_KEY = 'frxe.web.player.v1';
const LEGACY_LIBRARY_KEY = 'nont.music.youtube.favorites.v1';

const TABS: Array<{ id: FrxeTab; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'save', label: 'Save', icon: Download },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function decodeHtml(value: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function readTracks(key: string): Track[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.map((track) => refineMusicMetadata(track) as Track) : [];
  } catch {
    return [];
  }
}

function loadLibrary() {
  const current = readTracks(LIBRARY_KEY);
  if (current.length) return current;
  return readTracks(LEGACY_LIBRARY_KEY);
}

function loadSettings(): PlayerSettings {
  try {
    const value = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) || '{}');
    return {
      volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(100, value.volume)) : 76,
      muted: Boolean(value.muted),
      shuffle: Boolean(value.shuffle),
      repeat: value.repeat === 'queue' || value.repeat === 'track' ? value.repeat : 'off',
      motion: value.motion !== false,
      glass: value.glass === 'soft' || value.glass === 'minimal' ? value.glass : 'liquid',
    };
  } catch {
    return { volume: 76, muted: false, shuffle: false, repeat: 'off', motion: true, glass: 'liquid' };
  }
}

function uniqueTracks(items: Track[]) {
  const seen = new Set<string>();
  return items.filter((track) => {
    if (!track?.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export default function MusicApp() {
  const initialSettingsRef = useRef<PlayerSettings>(loadSettings());
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);
  const endedHandlerRef = useRef<() => void>(() => undefined);

  const [tab, setTab] = useState<FrxeTab>('home');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [library, setLibrary] = useState<Track[]>(loadLibrary);
  const [history, setHistory] = useState<Track[]>(() => readTracks(HISTORY_KEY));
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialSettingsRef.current.volume);
  const [muted, setMuted] = useState(initialSettingsRef.current.muted);
  const [shuffle, setShuffle] = useState(initialSettingsRef.current.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initialSettingsRef.current.repeat);
  const [motion, setMotion] = useState(initialSettingsRef.current.motion);
  const [glass, setGlass] = useState<GlassMode>(initialSettingsRef.current.glass);
  const [saveUrl, setSaveUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const libraryIds = useMemo(() => new Set(library.map((track) => track.id)), [library]);
  const homeSignal = useMemo(() => uniqueTracks([...history, ...library, ...results]).slice(0, 12), [history, library, results]);

  useEffect(() => {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library.slice(0, 300))); } catch { /* storage unavailable */ }
  }, [library]);

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100))); } catch { /* storage unavailable */ }
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify({ volume, muted, shuffle, repeat, motion, glass })); } catch { /* storage unavailable */ }
    document.documentElement.dataset.frxeMotion = motion ? 'full' : 'reduced';
    document.documentElement.dataset.frxeGlass = glass;
  }, [volume, muted, shuffle, repeat, motion, glass]);

  useEffect(() => {
    const win = window as any;

    const createPlayer = () => {
      if (playerRef.current || !win.YT?.Player) return;
      playerRef.current = new win.YT.Player('frxe-youtube-player', {
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            playerReadyRef.current = true;
            event.target.setVolume(initialSettingsRef.current.volume);
            if (initialSettingsRef.current.muted) event.target.mute();
            if (pendingVideoRef.current) {
              event.target.loadVideoById(pendingVideoRef.current);
              pendingVideoRef.current = null;
            }
          },
          onStateChange: (event: any) => {
            if (event.data === win.YT.PlayerState.PLAYING) setPlaying(true);
            if (event.data === win.YT.PlayerState.PAUSED || event.data === win.YT.PlayerState.CUED) setPlaying(false);
            if (event.data === win.YT.PlayerState.ENDED) {
              setPlaying(false);
              endedHandlerRef.current();
            }
          },
          onError: () => {
            setPlaying(false);
            setSearchError('This track cannot be played in the embedded YouTube player. Choose another result.');
          },
        },
      });
    };

    if (win.YT?.Player) createPlayer();
    else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        if (typeof previous === 'function') previous();
        createPlayer();
      };
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      try { playerRef.current?.destroy?.(); } catch { /* no-op */ }
      playerRef.current = null;
      playerReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!playerReadyRef.current || !player) return;
      try {
        const nextPosition = Number(player.getCurrentTime?.() || 0);
        const nextDuration = Number(player.getDuration?.() || 0);
        if (Number.isFinite(nextPosition)) setPosition(nextPosition);
        if (Number.isFinite(nextDuration)) setDuration(nextDuration);
      } catch { /* player not ready yet */ }
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReadyRef.current || !player) return;
    try {
      player.setVolume(volume);
      if (muted) player.mute();
      else player.unMute();
    } catch { /* no-op */ }
  }, [volume, muted]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (current && 'MediaMetadata' in window) {
      session.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: 'FRXE Web',
        artwork: current.thumbnail ? [{ src: current.thumbnail }] : [],
      });
    }
    try { session.setActionHandler('play', () => playerRef.current?.playVideo?.()); } catch { /* unsupported */ }
    try { session.setActionHandler('pause', () => playerRef.current?.pauseVideo?.()); } catch { /* unsupported */ }
    try { session.setActionHandler('nexttrack', () => move(1)); } catch { /* unsupported */ }
    try { session.setActionHandler('previoustrack', () => move(-1)); } catch { /* unsupported */ }
  }, [current, queue, shuffle]);

  function playTrack(track: Track, nextQueue: Track[] = results.length ? results : [track]) {
    const cleanTrack = refineMusicMetadata(track) as Track;
    setCurrent(cleanTrack);
    setQueue(nextQueue.length ? uniqueTracks(nextQueue) : [cleanTrack]);
    setHistory((items) => [cleanTrack, ...items.filter((item) => item.id !== cleanTrack.id)].slice(0, 100));
    setPosition(0);
    setDuration(0);
    setSearchError('');
    if (playerReadyRef.current && playerRef.current) playerRef.current.loadVideoById(cleanTrack.id);
    else pendingVideoRef.current = cleanTrack.id;
  }

  function move(direction: 1 | -1) {
    if (!current || !queue.length) return;
    if (shuffle && direction === 1 && queue.length > 1) {
      const candidates = queue.filter((track) => track.id !== current.id);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      if (next) playTrack(next, queue);
      return;
    }
    const foundIndex = queue.findIndex((track) => track.id === current.id);
    const index = foundIndex >= 0 ? foundIndex : 0;
    const nextIndex = (index + direction + queue.length) % queue.length;
    playTrack(queue[nextIndex], queue);
  }

  function onEnded() {
    if (!current) return;
    if (repeat === 'track') {
      playerRef.current?.seekTo?.(0, true);
      playerRef.current?.playVideo?.();
      return;
    }
    const index = queue.findIndex((track) => track.id === current.id);
    if (index < queue.length - 1 || repeat === 'queue') move(1);
  }
  endedHandlerRef.current = onEnded;

  function togglePlay() {
    const player = playerRef.current;
    if (!playerReadyRef.current || !player) return;
    if (!current) {
      const first = results[0] || library[0] || history[0];
      if (first) playTrack(first, results.length ? results : [first]);
      return;
    }
    try {
      const state = player.getPlayerState?.();
      const win = window as any;
      if (state === win.YT?.PlayerState?.PLAYING) player.pauseVideo();
      else player.playVideo();
    } catch { /* no-op */ }
  }

  function seek(value: number) {
    if (!playerReadyRef.current || !playerRef.current) return;
    playerRef.current.seekTo(value, true);
    setPosition(value);
  }

  function cycleRepeat() {
    setRepeat((value) => value === 'off' ? 'queue' : value === 'queue' ? 'track' : 'off');
  }

  function toggleLibrary(track: Track) {
    setLibrary((items) => items.some((item) => item.id === track.id)
      ? items.filter((item) => item.id !== track.id)
      : [track, ...items]);
  }

  async function runSearch(text: string) {
    const term = text.trim();
    if (!term || searching) return;
    setSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(term)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Search failed (${response.status}).`);
      const decoded = (data.items || []).map((item: Track) => refineMusicMetadata({
        ...item,
        title: decodeHtml(item.title),
        artist: decodeHtml(item.artist),
      }) as Track);
      const tracks = mergeAndRankMusicResults(decoded, term, 30) as Track[];
      setResults(tracks);
      setQueue(tracks);
      if (!tracks.length) setSearchError('No playable music results were found for that search.');
    } catch (error) {
      setResults([]);
      setQueue([]);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  async function searchMusic(event: FormEvent) {
    event.preventDefault();
    await runSearch(query);
  }

  async function saveDirectMedia(event: FormEvent) {
    event.preventDefault();
    if (saveBusy || !saveUrl.trim()) return;
    setSaveBusy(true);
    setSaveStatus('');
    try {
      const url = new URL(saveUrl.trim());
      if (url.protocol !== 'https:') throw new Error('Use an HTTPS direct media URL.');
      if (/youtube\.com$|youtu\.be$/i.test(url.hostname) || url.hostname.endsWith('.youtube.com')) {
        throw new Error('YouTube stays in the embedded player. Save only authorized direct media URLs.');
      }

      try {
        const response = await fetch(url.toString(), { mode: 'cors' });
        if (!response.ok) throw new Error(`Download returned ${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = decodeURIComponent(url.pathname.split('/').pop() || 'frxe-media');
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setSaveStatus('Saved through the browser in the source file format.');
      } catch {
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
        setSaveStatus('Opened the authorized media URL in your browser download flow.');
      }
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveBusy(false);
    }
  }

  const ambientStyle = current?.thumbnail
    ? ({ '--frxe-artwork': `url("${current.thumbnail}")` } as React.CSSProperties)
    : undefined;

  return (
    <div className="frxe-app" style={ambientStyle}>
      <div className="frxe-ambient" aria-hidden="true" />
      <div className="frxe-noise" aria-hidden="true" />
      <div className="frxe-source-player" aria-hidden="true"><div id="frxe-youtube-player" /></div>

      <main className="frxe-stage">
        {tab === 'home' && (
          <section className="frxe-screen frxe-home">
            <header className="frxe-heading">
              <div>
                <span className="frxe-kicker">WEB PLAYER · SOURCE v{FRXE_SOURCE_VERSION}</span>
                <h1>FRXE</h1>
                <p>Liquid sound. Zero visual noise.</p>
              </div>
              <a className="frxe-icon-button" href={FRXE_REPO} target="_blank" rel="noreferrer" aria-label="Open Frxe source on GitHub">
                <ExternalLink size={19} />
              </a>
            </header>

            {homeSignal.length ? (
              <>
                {history.length > 0 && <TrackRail title="Recently played" tracks={history.slice(0, 10)} onPlay={(track) => playTrack(track, history)} />}
                {library.length > 0 && <TrackRail title="Saved to Library" tracks={library.slice(0, 10)} onPlay={(track) => playTrack(track, library)} />}
                {results.length > 0 && <TrackRail title="Your latest signal" subtitle="From your most recent search" tracks={results.slice(0, 12)} onPlay={(track) => playTrack(track, results)} />}
              </>
            ) : (
              <Glass className="frxe-empty-home" strong>
                <Music2 size={34} />
                <h2>Build your signal</h2>
                <p>Search Frxe and your recent plays, saved tracks and latest results will shape this home screen.</p>
                <button className="frxe-primary" onClick={() => setTab('search')}><SearchIcon size={17} /> Search music</button>
              </Glass>
            )}
          </section>
        )}

        {tab === 'search' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact">
              <div><h2>Search</h2><p>YouTube music search · official-first ranking · local web library</p></div>
            </header>
            <Glass className="frxe-search-glass" strong>
              <form onSubmit={searchMusic}>
                <SearchIcon size={20} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Frxe" placeholder="Search Frxe" />
                <button type="submit" className="frxe-search-submit" aria-label="Search music" disabled={searching || !query.trim()}>
                  {searching ? <Loader2 size={18} className="frxe-spin" /> : <ArrowDown size={18} />}
                </button>
              </form>
            </Glass>
            {searchError && <div className="frxe-error" role="alert">{searchError}</div>}
            <div className="frxe-result-list">
              {results.map((track) => (
                <Glass key={track.id} className={current?.id === track.id ? 'frxe-result active' : 'frxe-result'}>
                  <button className="frxe-result-play" aria-label={`Play ${track.title}`} onClick={() => current?.id === track.id ? togglePlay() : playTrack(track, results)}>
                    {current?.id === track.id && playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <button className="frxe-result-main" onClick={() => playTrack(track, results)}>
                    <img src={track.thumbnail} alt="" loading="lazy" />
                    <span><strong className="frxe-result-title">{track.title}</strong><small>{track.artist}</small></span>
                  </button>
                  <span className="frxe-result-badge">{track.official ? 'Official' : track.duration || 'Music'}</span>
                  <button className={libraryIds.has(track.id) ? 'frxe-save-button saved' : 'frxe-save-button'} aria-label={libraryIds.has(track.id) ? `Remove ${track.title} from Library` : `Save ${track.title} to Library`} onClick={() => toggleLibrary(track)}>
                    <Heart size={18} fill={libraryIds.has(track.id) ? 'currentColor' : 'none'} />
                  </button>
                </Glass>
              ))}
              {!searching && !results.length && !searchError && <div className="frxe-quiet-state">Search songs, artists and albums to begin.</div>}
            </div>
          </section>
        )}

        {tab === 'save' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact">
              <div><h2>Save</h2><p>Save authorized direct media in the browser. YouTube stays in the embedded player.</p></div>
            </header>
            <Glass className="frxe-save-card" strong>
              <div className="frxe-save-preview">
                <div className="frxe-generated-art"><Download size={28} /></div>
                <div><strong>Frxe Save</strong><span>Browser-safe direct media</span></div>
              </div>
              <form onSubmit={saveDirectMedia}>
                <label htmlFor="frxe-save-url">Direct media URL</label>
                <input id="frxe-save-url" value={saveUrl} onChange={(event) => setSaveUrl(event.target.value)} placeholder="https://example.com/audio.mp3" />
                <div className="frxe-format-row">
                  <span className="active">Original</span><span title="Android source feature">MP3 · Android</span><span title="Android source feature">FLAC · Android</span><span title="Android source feature">WAV · Android</span>
                </div>
                <button className="frxe-primary wide" disabled={saveBusy || !saveUrl.trim()}>
                  {saveBusy ? <Loader2 className="frxe-spin" size={18} /> : <Download size={18} />} Save direct media
                </button>
              </form>
            </Glass>
            <Glass className="frxe-save-status">
              <strong>Web Save status</strong>
              <p>{saveStatus || 'The web build preserves Frxe’s safe Save policy. Browser conversion to MP3/FLAC/WAV is not faked; the Android app owns transcoding.'}</p>
            </Glass>
          </section>
        )}

        {tab === 'library' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact">
              <div><h2>Library</h2><p>Your saved tracks and listening history stay on this device.</p></div>
            </header>
            <LibrarySection title="Saved" empty="Heart a track to save it here." tracks={library} onPlay={(track) => playTrack(track, library)} onRemove={toggleLibrary} />
            <LibrarySection title="Recently played" empty="Play something and it will appear here." tracks={history} onPlay={(track) => playTrack(track, history)} />
            {history.length > 0 && <button className="frxe-text-button" onClick={() => setHistory([])}>Clear listening history</button>}
          </section>
        )}

        {tab === 'settings' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact">
              <div><h2>Settings</h2><p>Web playback, liquid glass and source parity.</p></div>
            </header>
            <Glass className="frxe-settings-card" strong>
              <SettingRow title="Volume" detail={`${muted ? 0 : volume}%`}>
                <input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
                <button className="frxe-icon-button small" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
              </SettingRow>
              <SettingRow title="Motion" detail={motion ? 'Springy' : 'Reduced'}><Toggle value={motion} onChange={setMotion} /></SettingRow>
              <SettingRow title="Glass" detail={glass}>
                <select aria-label="Glass mode" value={glass} onChange={(event) => setGlass(event.target.value as GlassMode)}>
                  <option value="liquid">Liquid</option><option value="soft">Soft</option><option value="minimal">Minimal</option>
                </select>
              </SettingRow>
              <SettingRow title="Shuffle" detail={shuffle ? 'On' : 'Off'}><Toggle value={shuffle} onChange={setShuffle} /></SettingRow>
              <SettingRow title="Repeat" detail={repeat}><button className="frxe-pill-button" onClick={cycleRepeat}><Repeat2 size={15} /> Cycle</button></SettingRow>
            </Glass>
            <Glass className="frxe-source-card">
              <div><span className="frxe-kicker">SOURCE OF TRUTH</span><h3>voidnont/Frxe · v{FRXE_SOURCE_VERSION}</h3><p>This web player mirrors Frxe’s Home, Search, Save, Library, Settings, mini-player, liquid glass and Now Playing structure. Android-only APIs such as Media3 Cast, VOSK and FFmpeg remain native-only.</p></div>
              <a className="frxe-primary" href={FRXE_REPO} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Source</a>
            </Glass>
          </section>
        )}
      </main>

      {current && !playerOpen && (
        <Glass className="frxe-mini-player" strong>
          <button className="frxe-mini-main" onClick={() => setPlayerOpen(true)}>
            <img src={current.thumbnail} alt="" />
            <span><strong>{current.title}</strong><small>{current.artist}</small></span>
          </button>
          <button className="frxe-icon-button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button>
        </Glass>
      )}

      {!playerOpen && (
        <Glass className="frxe-nav" strong>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} aria-label={label} onClick={() => setTab(id)}>
              <Icon size={20} /> <span>{label}</span>
            </button>
          ))}
        </Glass>
      )}

      {playerOpen && current && (
        <div className="frxe-player-overlay">
          <div className="frxe-player-bg" aria-hidden="true" />
          <div className="frxe-player-content">
            <div className="frxe-player-top">
              <button className="frxe-icon-button" aria-label="Close player" onClick={() => setPlayerOpen(false)}><ChevronDown size={23} /></button>
              <div><strong>NOW PLAYING</strong><span>{glass.toUpperCase()}</span></div>
              <button className="frxe-icon-button" aria-label="Player tools" onClick={() => setToolsOpen((value) => !value)}><ListMusic size={21} /></button>
            </div>

            <div className="frxe-player-grid">
              <div className="frxe-player-primary">
                <img className="frxe-player-art" src={current.thumbnail} alt="" />
                <div className="frxe-player-meta"><h2>{current.title}</h2><p>{current.artist}</p></div>
                <div className="frxe-progress">
                  <input aria-label="Seek" type="range" min="0" max={Math.max(duration, 1)} value={Math.min(position, Math.max(duration, 1))} onChange={(event) => seek(Number(event.target.value))} />
                  <div><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div>
                </div>
                <div className="frxe-player-controls">
                  <button className={shuffle ? 'active' : ''} aria-label="Shuffle" onClick={() => setShuffle((value) => !value)}><Shuffle size={21} /></button>
                  <button aria-label="Previous" onClick={() => move(-1)}><SkipBack size={31} fill="currentColor" /></button>
                  <button className="main" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" />}</button>
                  <button aria-label="Next" onClick={() => move(1)}><SkipForward size={31} fill="currentColor" /></button>
                  <button className={repeat !== 'off' ? 'active' : ''} aria-label="Repeat" onClick={cycleRepeat}><Repeat2 size={21} />{repeat === 'track' && <b>1</b>}</button>
                </div>
                <Glass className="frxe-player-utilities">
                  <Utility icon={<Heart size={24} fill={libraryIds.has(current.id) ? 'currentColor' : 'none'} />} label={libraryIds.has(current.id) ? 'Saved' : 'Save'} onClick={() => toggleLibrary(current)} />
                  <Utility icon={<ListMusic size={24} />} label="Queue" onClick={() => setToolsOpen((value) => !value)} />
                  <Utility icon={<SlidersHorizontal size={24} />} label="Audio" onClick={() => setToolsOpen(true)} />
                  <Utility icon={<Cast size={24} />} label="Cast" disabled />
                  <Utility icon={<Mic size={24} />} label="Voice" disabled />
                </Glass>
              </div>

              <div className="frxe-player-side">
                {toolsOpen ? (
                  <Glass className="frxe-tools" strong>
                    <div className="frxe-tools-heading"><div><span className="frxe-kicker">PLAYER TOOLS</span><h3>Queue & audio</h3></div><button className="frxe-icon-button small" aria-label="Close tools" onClick={() => setToolsOpen(false)}><X size={17} /></button></div>
                    <div className="frxe-tool-volume"><button onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></div>
                    <div className="frxe-queue-list">
                      {queue.map((track) => <button key={track.id} className={track.id === current.id ? 'active' : ''} onClick={() => playTrack(track, queue)}><img src={track.thumbnail} alt=""/><span><strong>{track.title}</strong><small>{track.artist}</small></span></button>)}
                    </div>
                  </Glass>
                ) : (
                  <>
                    <div><span className="frxe-kicker">LYRICS</span><h3>Synced lyrics</h3></div>
                    <Glass className="frxe-lyrics" strong>
                      <p>Frxe’s Android source currently ships generated demo lyric timing rather than a live lyrics provider. The web player keeps this panel honest instead of presenting demo text as real lyrics.</p>
                    </Glass>
                    <Glass className="frxe-web-source">
                      <div><strong>YouTube embedded playback</strong><p>Search and playback stay inside the official embedded player flow.</p></div>
                      <a href={`https://www.youtube.com/watch?v=${current.id}`} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Open video</a>
                    </Glass>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Glass({ children, className = '', strong = false }: { children: React.ReactNode; className?: string; strong?: boolean }) {
  return <div className={`frxe-glass ${strong ? 'strong' : ''} ${className}`.trim()}>{children}</div>;
}

function TrackRail({ title, subtitle, tracks, onPlay }: { title: string; subtitle?: string; tracks: Track[]; onPlay: (track: Track) => void }) {
  return <section className="frxe-rail-section"><div className="frxe-section-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="frxe-track-rail">{tracks.map((track) => <button key={track.id} className="frxe-track-card" onClick={() => onPlay(track)}><Glass><img src={track.thumbnail} alt="" loading="lazy"/><strong>{track.title}</strong><span>{track.artist}</span></Glass></button>)}</div></section>;
}

function LibrarySection({ title, empty, tracks, onPlay, onRemove }: { title: string; empty: string; tracks: Track[]; onPlay: (track: Track) => void; onRemove?: (track: Track) => void }) {
  return <section className="frxe-library-section"><div className="frxe-section-heading"><h2>{title}</h2><p>{tracks.length} tracks</p></div>{tracks.length ? <div className="frxe-library-grid">{tracks.map((track) => <Glass className="frxe-library-item" key={track.id}><button className="frxe-library-main" onClick={() => onPlay(track)}><img src={track.thumbnail} alt=""/><span><strong>{track.title}</strong><small>{track.artist}</small></span><Play size={17} fill="currentColor"/></button>{onRemove && <button className="frxe-icon-button small" aria-label={`Remove ${track.title}`} onClick={() => onRemove(track)}><X size={16}/></button>}</Glass>)}</div> : <div className="frxe-quiet-state">{empty}</div>}</section>;
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <div className="frxe-setting-row"><div><strong>{title}</strong><span>{detail}</span></div><div className="frxe-setting-control">{children}</div></div>;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className={value ? 'frxe-toggle active' : 'frxe-toggle'} aria-pressed={value} onClick={() => onChange(!value)}><span /></button>;
}

function Utility({ icon, label, onClick, disabled = false }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return <button className="frxe-utility" onClick={onClick} disabled={disabled} title={disabled ? `${label} stays native-only in Frxe Android` : label}>{icon}<span>{label}</span></button>;
}
