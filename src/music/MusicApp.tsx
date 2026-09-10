import {
  Disc3,
  Heart,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  src: string;
  cover?: string;
  objectUrl?: string;
};

type RepeatMode = "off" | "queue" | "track";

const STORAGE_KEY = "nont.music.web.favorites.v1";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cleanFilename(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function coverFor(track: Track) {
  if (track.cover) return track.cover;
  const hue = Math.abs([...track.id].reduce((n, c) => n + c.charCodeAt(0) * 7, 0)) % 360;
  return `linear-gradient(145deg, hsl(${hue} 72% 55%), hsl(${(hue + 56) % 360} 70% 24%))`;
}

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [library, setLibrary] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.76);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((value) => URL.revokeObjectURL(value));
      objectUrlsRef.current.clear();
    };
  }, []);

  const visibleTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((track) =>
      `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(q)
    );
  }, [library, query]);

  function readFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((file) => file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name));
    if (!files.length) return;

    const added = files.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(objectUrl);
      const base = cleanFilename(file.name);
      const split = base.split(" - ");
      return {
        id: `${file.name}-${file.size}-${file.lastModified}`,
        title: split.length > 1 ? split.slice(1).join(" - ") : base,
        artist: split.length > 1 ? split[0] : "Local file",
        album: "Browser library",
        duration: 0,
        src: objectUrl,
        objectUrl,
      } satisfies Track;
    });

    setLibrary((old) => {
      const ids = new Set(old.map((t) => t.id));
      return [...old, ...added.filter((t) => !ids.has(t.id))];
    });
    setQueue((old) => old.length ? old : added);
    if (!current && added[0]) void startTrack(added[0], added);
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) readFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) readFiles(event.dataTransfer.files);
  }

  async function startTrack(track: Track, nextQueue = queue.length ? queue : library) {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrent(track);
    setPosition(0);
    setDuration(track.duration || 0);
    setQueue(nextQueue.length ? nextQueue : [track]);

    if (audio.src !== track.src) {
      audio.src = track.src;
      audio.load();
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      if (library[0]) await startTrack(library[0], library);
      return;
    }
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); } catch { setPlaying(false); }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function move(direction: 1 | -1) {
    if (!current || !queue.length) return;
    const index = queue.findIndex((track) => track.id === current.id);
    if (shuffle && direction === 1) {
      const candidates = queue.filter((t) => t.id !== current.id);
      const next = candidates[Math.floor(Math.random() * candidates.length)] || current;
      void startTrack(next, queue);
      return;
    }
    const nextIndex = (index + direction + queue.length) % queue.length;
    void startTrack(queue[nextIndex], queue);
  }

  function onEnded() {
    if (!current) return;
    if (repeat === "track") {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; void audio.play(); }
      return;
    }
    const index = queue.findIndex((track) => track.id === current.id);
    if (index < queue.length - 1 || repeat === "queue") move(1);
    else setPlaying(false);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = value;
    setPosition(value);
  }

  function toggleFavorite(id: string) {
    setFavorites((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  function cycleRepeat() {
    setRepeat((old) => old === "off" ? "queue" : old === "queue" ? "track" : "off");
  }

  function addUrl(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!/^https?:\/\//i.test(value)) return;
    const title = urlTitle.trim() || cleanFilename(decodeURIComponent(value.split("/").pop()?.split("?")[0] || "Web track"));
    const track: Track = {
      id: `url-${crypto.randomUUID()}`,
      title,
      artist: "Web audio",
      album: "Direct audio URL",
      duration: 0,
      src: value,
    };
    setLibrary((old) => [...old, track]);
    setQueue((old) => [...old, track]);
    setUrl("");
    setUrlTitle("");
    setShowUrl(false);
    void startTrack(track, [...queue, track]);
  }

  function removeTrack(id: string) {
    const target = library.find((track) => track.id === id);
    if (target?.objectUrl) { URL.revokeObjectURL(target.objectUrl); objectUrlsRef.current.delete(target.objectUrl); }
    setLibrary((old) => old.filter((track) => track.id !== id));
    setQueue((old) => old.filter((track) => track.id !== id));
    setFavorites((old) => old.filter((fav) => fav !== id));
    if (current?.id === id) {
      audioRef.current?.pause();
      setCurrent(null);
      setPlaying(false);
      setPosition(0);
      setDuration(0);
    }
  }

  const currentCover = current ? coverFor(current) : "linear-gradient(145deg,#22262c,#0d0e11)";

  return (
    <div
      className={`app ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
          if (current && Number.isFinite(d)) {
            setLibrary((old) => old.map((t) => t.id === current.id ? { ...t, duration: d } : t));
          }
        }}
        onEnded={onEnded}
      />

      <header className="topbar">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-icon"><Music2 size={20} /></span>
          <span><strong>NONT</strong><small>MUSIC</small></span>
        </button>

        <div className="search">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your music" />
        </div>

        <div className="top-actions">
          <button className="ghost" onClick={() => setShowUrl(true)}><Plus size={16} /> URL</button>
          <button className="primary" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Add music</button>
          <input ref={fileInputRef} type="file" accept="audio/*,.flac,.m4a,.opus" multiple hidden onChange={onFiles} />
        </div>
      </header>

      <main className="layout">
        <section className="library">
          <div className="section-head">
            <div>
              <span className="eyebrow">NONT WEB PLAYER</span>
              <h1>Your music.<br/><em>Nothing in the way.</em></h1>
              <p>Drop audio files into NONT or add a browser-playable audio URL. Playback happens in your browser.</p>
            </div>
            <div className="library-stats">
              <strong>{library.length}</strong>
              <span>tracks loaded</span>
            </div>
          </div>

          {library.length === 0 ? (
            <button className="dropzone" onClick={() => fileInputRef.current?.click()}>
              <span><Disc3 size={34} /></span>
              <strong>Drop music here</strong>
              <small>MP3, M4A, AAC, WAV, OGG, FLAC and Opus</small>
            </button>
          ) : (
            <div className="track-list">
              <div className="track-header">
                <span>#</span><span>Title</span><span>Album</span><span>Time</span><span />
              </div>
              {visibleTracks.map((track, index) => (
                <div className={`track-row ${current?.id === track.id ? "active" : ""}`} key={track.id}>
                  <button className="row-play" onClick={() => current?.id === track.id ? void togglePlay() : void startTrack(track, visibleTracks)}>
                    {current?.id === track.id && playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button className="track-main" onClick={() => void startTrack(track, visibleTracks)}>
                    <span className="tiny-cover" style={track.cover ? { backgroundImage: `url("${track.cover}")` } : { background: coverFor(track) }} />
                    <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                  </button>
                  <span className="album">{track.album}</span>
                  <span className="time">{formatTime(track.duration)}</span>
                  <div className="row-actions">
                    <button className={favorites.includes(track.id) ? "liked" : ""} onClick={() => toggleFavorite(track.id)}><Heart size={15} fill={favorites.includes(track.id) ? "currentColor" : "none"} /></button>
                    <button onClick={() => removeTrack(track.id)}><X size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="now">
          <span className="eyebrow">NOW PLAYING</span>
          <div className="cover" style={current?.cover ? { backgroundImage: `url("${current.cover}")` } : { background: currentCover }}>
            {!current && <Music2 size={48} />}
          </div>
          <div className="now-copy">
            <div>
              <strong>{current?.title || "Nothing playing"}</strong>
              <span>{current?.artist || "Add music to begin"}</span>
            </div>
            {current && <button className={favorites.includes(current.id) ? "liked" : ""} onClick={() => toggleFavorite(current.id)}><Heart size={18} fill={favorites.includes(current.id) ? "currentColor" : "none"} /></button>}
          </div>

          <div className="progress-block">
            <input
              className="range progress"
              type="range"
              min="0"
              max={Math.max(duration, 0)}
              step="0.1"
              value={Math.min(position, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              disabled={!current}
            />
            <div><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div>
          </div>

          <div className="controls">
            <button className={shuffle ? "active-control" : ""} title="Shuffle" onClick={() => setShuffle((v) => !v)}><Shuffle size={18} /></button>
            <button title="Previous" onClick={() => move(-1)}><SkipBack size={21} fill="currentColor" /></button>
            <button className="play-main" onClick={() => void togglePlay()}>{playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</button>
            <button title="Next" onClick={() => move(1)}><SkipForward size={21} fill="currentColor" /></button>
            <button className={repeat !== "off" ? "active-control repeat" : "repeat"} title={`Repeat: ${repeat}`} onClick={cycleRepeat}><Repeat2 size={18} />{repeat === "track" && <b>1</b>}</button>
          </div>

          <div className="volume-row">
            <button onClick={() => setMuted((v) => !v)}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <input className="range" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} />
          </div>

          <div className="queue">
            <div className="queue-title"><span><ListMusic size={16}/> Queue</span><small>{queue.length}</small></div>
            <div className="queue-list">
              {queue.length === 0 ? <p>Queue is empty.</p> : queue.slice(0, 12).map((track) => (
                <button key={track.id} className={current?.id === track.id ? "queue-item active" : "queue-item"} onClick={() => void startTrack(track, queue)}>
                  <span className="queue-art" style={track.cover ? { backgroundImage: `url("${track.cover}")` } : { background: coverFor(track) }} />
                  <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                  <span>{formatTime(track.duration)}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {showUrl && (
        <div className="modal-backdrop" onMouseDown={() => setShowUrl(false)}>
          <form className="modal" onSubmit={addUrl} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head"><div><small>WEB AUDIO</small><h2>Add audio URL</h2></div><button type="button" onClick={() => setShowUrl(false)}><X size={18}/></button></div>
            <label>Direct audio URL<input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/song.mp3" /></label>
            <label>Title <span>(optional)</span><input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Track title" /></label>
            <p>The URL must be directly playable by your browser and permit cross-origin playback where required.</p>
            <button className="primary full" type="submit">Add to player</button>
          </form>
        </div>
      )}

      {dragging && <div className="drag-overlay"><Upload size={38}/><strong>Drop to add music</strong></div>}
    </div>
  );
}
