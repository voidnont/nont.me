import {
  Heart,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { mergeAndRankMusicResults, refineMusicMetadata } from "../shared/musicSearch.js";

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

type RepeatMode = "off" | "queue" | "track";
type PlayerSettings = { volume: number; muted: boolean; shuffle: boolean; repeat: RepeatMode };

const NONT_LOGO = "https://raw.githubusercontent.com/voidnont/NontMusic/main/public/nontmusic.png";
const FAVORITES_KEY = "nont.music.youtube.favorites.v1";
const PLAYER_SETTINGS_KEY = "nont.music.web.player.v1";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function decodeHtml(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function loadFavorites(): Track[] {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(value) ? value.map((track) => refineMusicMetadata(track) as Track) : [];
  } catch {
    return [];
  }
}

function loadPlayerSettings(): PlayerSettings {
  try {
    const value = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) || "{}");
    return {
      volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(100, value.volume)) : 76,
      muted: Boolean(value.muted),
      shuffle: Boolean(value.shuffle),
      repeat: value.repeat === "queue" || value.repeat === "track" ? value.repeat : "off",
    };
  } catch {
    return { volume: 76, muted: false, shuffle: false, repeat: "off" };
  }
}

export default function MusicApp() {
  const initialSettingsRef = useRef<PlayerSettings>(loadPlayerSettings());
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);
  const endedHandlerRef = useRef<() => void>(() => undefined);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [favorites, setFavorites] = useState<Track[]>(loadFavorites);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialSettingsRef.current.volume);
  const [muted, setMuted] = useState(initialSettingsRef.current.muted);
  const [shuffle, setShuffle] = useState(initialSettingsRef.current.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(initialSettingsRef.current.repeat);
  const [showFavorites, setShowFavorites] = useState(false);

  const displayTracks = useMemo(() => (showFavorites ? favorites : results), [showFavorites, favorites, results]);
  const favoriteIds = useMemo(() => new Set(favorites.map((track) => track.id)), [favorites]);

  useEffect(() => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.slice(0, 200))); } catch { /* storage unavailable */ }
  }, [favorites]);

  useEffect(() => {
    try { localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify({ volume, muted, shuffle, repeat })); } catch { /* storage unavailable */ }
  }, [volume, muted, shuffle, repeat]);

  useEffect(() => {
    const win = window as any;

    const createPlayer = () => {
      if (playerRef.current || !win.YT?.Player) return;
      playerRef.current = new win.YT.Player("nont-youtube-player", {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 1,
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
            setSearchError("This track cannot be played in the embedded player. Choose another result.");
          },
        },
      });
    };

    if (win.YT?.Player) createPlayer();
    else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") previous();
        createPlayer();
      };
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
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
    }, 500);
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

  function playTrack(track: Track, nextQueue: Track[] = displayTracks) {
    setCurrent(track);
    setQueue(nextQueue.length ? nextQueue : [track]);
    setPosition(0);
    setDuration(0);
    setSearchError("");
    if (playerReadyRef.current && playerRef.current) {
      playerRef.current.loadVideoById(track.id);
    } else {
      pendingVideoRef.current = track.id;
    }
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
    if (repeat === "track") {
      playerRef.current?.seekTo?.(0, true);
      playerRef.current?.playVideo?.();
      return;
    }
    const index = queue.findIndex((track) => track.id === current.id);
    if (index < queue.length - 1 || repeat === "queue") move(1);
  }
  endedHandlerRef.current = onEnded;

  function togglePlay() {
    const player = playerRef.current;
    if (!playerReadyRef.current || !player) return;
    if (!current) {
      if (displayTracks[0]) playTrack(displayTracks[0], displayTracks);
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
    setRepeat((value) => value === "off" ? "queue" : value === "queue" ? "track" : "off");
  }

  function toggleFavorite(track: Track) {
    setFavorites((items) => {
      if (items.some((item) => item.id === track.id)) return items.filter((item) => item.id !== track.id);
      return [track, ...items];
    });
  }

  async function searchMusic(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || searching) return;
    setSearching(true);
    setSearchError("");
    setShowFavorites(false);
    try {
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(text)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Search failed (${response.status}).`);
      const decoded = (data.items || []).map((item: Track) => refineMusicMetadata({
        ...item,
        title: decodeHtml(item.title),
        artist: decodeHtml(item.artist),
      }) as Track);
      const tracks = mergeAndRankMusicResults(decoded, text, 30) as Track[];
      setResults(tracks);
      setQueue(tracks);
      if (!tracks.length) setSearchError("No playable music results were found for that search.");
    } catch (error) {
      setResults([]);
      setQueue([]);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  const currentThumb = current?.thumbnail || NONT_LOGO;

  return (
    <div className="music-app">
      <header className="music-topbar">
        <a className="music-brand" href="/music" aria-label="NontMusic home">
          <span className="music-brand-icon"><img src={NONT_LOGO} alt="NontMusic" /></span>
          <span><strong>NONT</strong><small>MUSIC WEB</small></span>
        </a>

        <form className="youtube-search" onSubmit={searchMusic}>
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search songs, artists, albums…"
            aria-label="Search music"
          />
          <button className="music-primary" type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 size={17} className="spin" /> : <Search size={17} />}
            Search
          </button>
        </form>

        <button className={showFavorites ? "favorites-button active" : "favorites-button"} aria-pressed={showFavorites} onClick={() => setShowFavorites((value) => !value)}>
          <Heart size={17} fill={showFavorites ? "currentColor" : "none"} /> Favorites
        </button>
      </header>

      <main className="music-layout">
        <section className="music-results-section">
          <div className="music-hero">
            <div>
              <span className="music-eyebrow">NONTMUSIC WEB · MUSIC-FIRST SEARCH</span>
              <h1>Find it.<br /><em>Press play.</em></h1>
              <p>Official, Topic and VEVO music results are prioritized automatically, duplicate versions are merged, and noisy video labels are cleaned up.</p>
            </div>
            <div className="music-stat"><strong>{displayTracks.length}</strong><span>{showFavorites ? "favorites" : "results"}</span></div>
          </div>

          {searchError && <div className="music-error" role="alert">{searchError}</div>}

          {displayTracks.length === 0 ? (
            <div className="music-empty">
              <img src={NONT_LOGO} alt="NontMusic" />
              <h2>{showFavorites ? "No favorites yet" : "Search for music"}</h2>
              <p>{showFavorites ? "Heart a song and it will appear here." : "Use the search box above to find songs and official music videos."}</p>
            </div>
          ) : (
            <div className="youtube-results">
              {displayTracks.map((track) => (
                <article className={current?.id === track.id ? "youtube-row active" : "youtube-row"} key={track.id}>
                  <button className="result-play" onClick={() => current?.id === track.id ? togglePlay() : playTrack(track, displayTracks)} aria-label={`Play ${track.title}`}>
                    {current?.id === track.id && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  </button>
                  <button className="result-main" onClick={() => playTrack(track, displayTracks)}>
                    <img src={track.thumbnail} alt="" loading="lazy" />
                    <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                  </button>
                  <span className="result-source">{track.official ? "Official" : track.duration || "Music"}</span>
                  <button className={favoriteIds.has(track.id) ? "result-heart liked" : "result-heart"} onClick={() => toggleFavorite(track)} aria-label={favoriteIds.has(track.id) ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}>
                    <Heart size={17} fill={favoriteIds.has(track.id) ? "currentColor" : "none"} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="music-now">
          <span className="music-eyebrow">NOW PLAYING</span>
          <div className="youtube-player-shell">
            <div id="nont-youtube-player" />
            {!current && <div className="player-placeholder"><img src={NONT_LOGO} alt="NontMusic" /><span>Choose a song</span></div>}
          </div>

          <div className="now-track">
            <img src={currentThumb} alt="" />
            <div><strong>{current?.title || "Nothing playing"}</strong><span>{current?.artist || "Search music to begin"}</span></div>
            {current && <button className={favoriteIds.has(current.id) ? "liked" : ""} aria-label="Toggle favorite" onClick={() => toggleFavorite(current)}><Heart size={18} fill={favoriteIds.has(current.id) ? "currentColor" : "none"} /></button>}
          </div>

          <div className="music-progress">
            <input aria-label="Track position" type="range" min="0" max={Math.max(duration, 0)} step="0.1" value={Math.min(position, duration || 0)} onChange={(event) => seek(Number(event.target.value))} disabled={!current} />
            <div><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div>
          </div>

          <div className="music-controls">
            <button className={shuffle ? "active" : ""} aria-pressed={shuffle} onClick={() => setShuffle((value) => !value)} title="Shuffle"><Shuffle size={18} /></button>
            <button onClick={() => move(-1)} title="Previous" aria-label="Previous"><SkipBack size={22} fill="currentColor" /></button>
            <button className="main-play" onClick={togglePlay} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</button>
            <button onClick={() => move(1)} title="Next" aria-label="Next"><SkipForward size={22} fill="currentColor" /></button>
            <button className={repeat !== "off" ? "active repeat" : "repeat"} onClick={cycleRepeat} title={`Repeat: ${repeat}`} aria-label={`Repeat: ${repeat}`}><Repeat2 size={18} />{repeat === "track" && <b>1</b>}</button>
          </div>

          <div className="music-volume">
            <button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute" : "Mute"}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <input aria-label="Volume" type="range" min="0" max="100" step="1" value={volume} onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} />
          </div>

          <div className="music-queue">
            <div className="queue-heading"><span><ListMusic size={16} /> Queue</span><small>{queue.length}</small></div>
            <div className="queue-items">
              {queue.length === 0 ? <p>Search music to build a queue.</p> : queue.slice(0, 12).map((track) => (
                <button className={current?.id === track.id ? "queue-song active" : "queue-song"} key={track.id} onClick={() => playTrack(track, queue)}>
                  <img src={track.thumbnail} alt="" />
                  <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
