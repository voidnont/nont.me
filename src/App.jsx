import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  ExternalLink,
  Github,
  LoaderCircle,
  Monitor,
  Music2,
  Package,
  Search,
  Smartphone,
  X,
} from 'lucide-react';
import { detectCurrentDevice } from './device.js';
import { normalizeGithubRepo } from '../shared/github-repo.js';
import { recommendAsset } from '../shared/release-classifier.js';

const VERSION = '0.8.7';
const PLATFORM_OPTIONS = ['recommended', 'windows', 'android', 'macos', 'linux', 'ios'];
const PLATFORM_LABELS = {
  recommended: 'Recommended',
  windows: 'Windows',
  android: 'Android',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  chromeos: 'ChromeOS',
  unknown: 'Unknown device',
};

function formatBytes(bytes = 0) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function bestForPlatform(assets = [], platform) {
  return assets
    .filter((asset) => asset.installable && asset.platform === platform)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.size || 0) - (a.size || 0))[0] || null;
}

function validDownloadUrl(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['github.com', 'www.github.com'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sourceVersion(app, repo) {
  return app?.sources?.find((source) => source.repo?.toLowerCase() === repo.toLowerCase())?.version || '';
}

function PlatformIcon({ platform, size = 17 }) {
  if (platform === 'android' || platform === 'ios') return <Smartphone size={size} />;
  return <Monitor size={size} />;
}

function DownloadDrawer({ app, onClose, onDownload }) {
  if (!app) return null;
  const assets = (app.assets || []).filter((asset) => asset.platform && asset.platform !== 'unknown');
  const grouped = PLATFORM_OPTIONS.slice(1).map((platform) => ({
    platform,
    assets: assets.filter((asset) => asset.platform === platform),
  })).filter((group) => group.assets.length);

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="download-drawer" role="dialog" aria-modal="true" aria-label={`${app.name || 'App'} downloads`}>
      <div className="drawer-head">
        <div>
          <span className="kicker">ALL RELEASE ASSETS</span>
          <h2>{app.name || app.repo || 'Downloads'}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close downloads"><X size={18} /></button>
      </div>
      {grouped.length ? <div className="download-groups">
        {grouped.map((group) => <div className="download-group" key={group.platform}>
          <h3><PlatformIcon platform={group.platform} /> {PLATFORM_LABELS[group.platform]}</h3>
          {group.assets.map((asset) => <div className="asset-row" key={`${asset.repo || app.repo}-${asset.id || asset.name}`}>
            <div>
              <strong>{asset.name}</strong>
              <span>{asset.arch !== 'unknown' ? asset.arch : 'architecture unspecified'}{asset.size ? ` · ${formatBytes(asset.size)}` : ''}</span>
            </div>
            {asset.installable ? <button className="small-download" data-download-url={asset.url} onClick={() => onDownload(asset)}>
              <Download size={15} /> Download
            </button> : <span className="not-direct">Not a direct install</span>}
          </div>)}
        </div>)}
      </div> : <div className="empty-panel"><Package size={24} /><strong>No installable release assets yet.</strong></div>}
    </section>
  </div>;
}

function ResultCard({ item, platform, device, onDetails, onDownload }) {
  const targetPlatform = platform === 'recommended' ? device.os : platform;
  const recommended = platform === 'recommended'
    ? recommendAsset(item.assets || [], device)
    : bestForPlatform(item.assets || [], targetPlatform);
  const badges = item.availablePlatforms || [];
  return <article className="result-card">
    <div className="result-main">
      <div className="result-icon"><Package size={21} /></div>
      <div className="result-copy">
        <div className="result-name-line">
          <h3>{item.name || item.repo}</h3>
          {item.latestVersion && <span>v{item.latestVersion}</span>}
        </div>
        <p className="repo-name">{item.repo}</p>
        <p>{item.description || 'No repository description provided.'}</p>
        <div className="platform-badges">
          {badges.map((badge) => <span key={badge}>{PLATFORM_LABELS[badge] || badge}</span>)}
          {!badges.length && <span>Source only</span>}
        </div>
      </div>
    </div>
    <div className="result-actions">
      {recommended ? <button className="primary compact" data-download-url={recommended.url} onClick={() => onDownload(recommended)}>
        <Download size={16} /> Download
      </button> : <button className="secondary compact" onClick={() => onDetails(item)}>View downloads <ChevronRight size={15} /></button>}
      <a className="repo-link" href={item.url || `https://github.com/${item.repo}`} target="_blank" rel="noreferrer">GitHub <ExternalLink size={13} /></a>
    </div>
  </article>;
}

export default function App() {
  const [device, setDevice] = useState({ os: 'unknown', arch: 'unknown', mobile: false, confidence: 'low' });
  const [frxe, setFrxe] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [platform, setPlatform] = useState('recommended');
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState({ frxe: true, search: false });
  const [error, setError] = useState('');

  useEffect(() => {
    void detectCurrentDevice().then(setDevice);
    void fetch('/api/github-app?app=frxe', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load Frxe');
        return data;
      })
      .then(setFrxe)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading((state) => ({ ...state, frxe: false })));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading((state) => ({ ...state, search: false }));
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading((state) => ({ ...state, search: true }));
      setError('');
      try {
        const directRepo = normalizeGithubRepo(trimmed);
        const url = directRepo
          ? `/api/github-app?repo=${encodeURIComponent(directRepo)}`
          : `/api/github-search?${new URLSearchParams({ q: trimmed, ...(platform !== 'recommended' ? { platform } : {}) }).toString()}`;
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Search failed');
        setResults(directRepo ? [data] : (data.items || []));
      } catch (reason) {
        if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setLoading((state) => ({ ...state, search: false }));
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, platform]);

  const heroRecommendation = useMemo(() => recommendAsset(frxe?.assets || [], device), [frxe, device]);
  const deviceLabel = `${PLATFORM_LABELS[device.os] || 'Unknown'}${device.arch !== 'unknown' ? ` · ${device.arch}` : ''}`;
  const windowsVersion = sourceVersion(frxe, 'voidnont/Frxe-Windows');
  const androidVersion = sourceVersion(frxe, 'voidnont/frxe');

  function startDownload(asset) {
    if (!asset?.url || !validDownloadUrl(asset.url)) {
      setError('This release did not provide a valid GitHub download URL.');
      return;
    }
    window.location.href = asset.url;
  }

  function heroAction() {
    if (device.os === 'unknown' || device.os === 'chromeos') return <button className="primary hero-download" onClick={() => setSelectedApp(frxe)} disabled={!frxe}>Choose download</button>;
    if (heroRecommendation) return <button className="primary hero-download" data-download-url={heroRecommendation.url} onClick={() => startDownload(heroRecommendation)}><Download size={18} /> Download Frxe for {PLATFORM_LABELS[device.os]}</button>;
    if (device.os === 'android') return <button className="primary hero-download" disabled>Android build not available yet</button>;
    return <button className="primary hero-download" onClick={() => setSelectedApp(frxe)} disabled={!frxe}>Choose {PLATFORM_LABELS[device.os]} download</button>;
  }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Nont home"><img src="/nont-icon.svg" alt="" /><span>Nont</span></a>
      <div className="header-right">
        <span className="device-pill"><span className="device-dot" /> {deviceLabel}</span>
        <a href="https://github.com/voidnont" target="_blank" rel="noreferrer" className="header-link"><Github size={17} /> <span>GitHub</span></a>
        <a href="https://ko-fi.com/voidnont" target="_blank" rel="noreferrer" className="header-link">Ko-fi</a>
      </div>
    </header>

    <main>
      <section className="hero-frxe">
        <div className="hero-copy">
          <span className="kicker">FEATURED · FRXE</span>
          <h1>One app.<br /><em>Your device.</em></h1>
          <p>Frxe is connected directly to its Windows and Android GitHub releases. Nont detects your device and selects the compatible package without making you choose a repository.</p>
          <div className="hero-actions">
            {loading.frxe ? <button className="primary hero-download" disabled><LoaderCircle className="spin" size={18} /> Checking releases…</button> : heroAction()}
            <button className="secondary hero-download" onClick={() => setSelectedApp(frxe)} disabled={!frxe}>Other downloads</button>
            <a className="secondary hero-download" href="https://music.nont.me">Open FRXE Web</a>
          </div>
          <div className="source-status">
            <span><Monitor size={15} /> Windows {windowsVersion ? `v${windowsVersion}` : frxe?.availablePlatforms?.includes('windows') ? 'available' : 'checking'}</span>
            <span><Smartphone size={15} /> Android {frxe?.availablePlatforms?.includes('android') ? (androidVersion ? `v${androidVersion}` : 'available') : 'not published yet'}</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="frxe-mark"><Music2 size={48} /><strong>FRXE</strong><span>{deviceLabel}</span></div>
        </div>
      </section>

      <section className="search-section" id="apps">
        <div className="section-heading">
          <div><span className="kicker">GITHUB APP SEARCH</span><h2>Find the build for your device.</h2></div>
          <span className="version">nont.me v{VERSION}</span>
        </div>
        <label className="github-search">
          <Search size={20} />
          <input aria-label="Search GitHub apps" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GitHub apps or paste owner/repo" autoComplete="off" />
          {loading.search && <LoaderCircle className="spin" size={18} />}
        </label>
        <div className="platform-tabs" role="tablist" aria-label="Platform filter">
          {PLATFORM_OPTIONS.map((item) => <button key={item} role="tab" aria-selected={platform === item} className={platform === item ? 'platform-tab active' : 'platform-tab'} onClick={() => setPlatform(item)}>{PLATFORM_LABELS[item]}</button>)}
        </div>
        {error && <div className="error-banner" role="status">{error}</div>}
        {!query.trim() ? <div className="discovery-empty">
          <Search size={25} /><div><strong>Search public GitHub apps.</strong><p>Results are split by real release assets: Windows installers, APKs, macOS packages, Linux packages, and iOS IPAs.</p></div>
        </div> : results.length ? <div className="results-list">{results.map((item) => <ResultCard key={item.repo || item.id} item={item} platform={platform} device={device} onDetails={setSelectedApp} onDownload={startDownload} />)}</div> : !loading.search && <div className="discovery-empty"><Package size={25} /><div><strong>No matching installable apps found.</strong><p>Try another query or platform.</p></div></div>}
      </section>
    </main>

    <footer><span>Nont · GitHub releases, matched to your device.</span><div><a href="https://github.com/voidnont" target="_blank" rel="noreferrer">GitHub</a><a href="https://ko-fi.com/voidnont" target="_blank" rel="noreferrer">Ko-fi</a></div></footer>
    <DownloadDrawer app={selectedApp} onClose={() => setSelectedApp(null)} onDownload={startDownload} />
  </div>;
}
