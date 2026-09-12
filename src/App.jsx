import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, Boxes, Check, CheckCircle2, ChevronRight,
  Download, ExternalLink, FileArchive, Home, Library,
  LoaderCircle, Moon, Music2, PackageOpen, Plus, RefreshCw, Search,
  Settings, ShieldCheck, Sun, Trash2, X,
} from 'lucide-react';

const VERSION = '0.7.4';
const NONTHUB_REPO = 'voidnont/NontHub';
const NONTMUSIC_REPO = 'voidnont/NontMusic';
const VEIL_REPO = 'voidnont/veilbrowser';
const SYNC_CACHE_KEY = 'nonthub.web.github-sync.v1';

const NONTHUB_LOGO = 'https://raw.githubusercontent.com/voidnont/NontHub/main/public/nonthub-logo.png';
const NONTMUSIC_LOGO = 'https://raw.githubusercontent.com/voidnont/NontMusic/main/public/nontmusic.png';
const VEIL_LOGO = 'https://raw.githubusercontent.com/voidnont/veilbrowser/main/assets/veil-glass-icon.png';

const repoConfigs = {
  [NONTHUB_REPO]: { fallbackVersion: '0.4.4' },
  [NONTMUSIC_REPO]: { fallbackVersion: '0.4.2' },
  [VEIL_REPO]: { fallbackVersion: '0.8.0' },
};

const nav = [
  ['home', 'Home', Home],
  ['library', 'Library', Library],
  ['downloads', 'Downloads', Download],
  ['installer', 'Installer', PackageOpen],
  ['settings', 'Settings', Settings],
];

const desktopApps = [
  {
    id: 'nonthub', name: 'NontHub', subtitle: 'Your NONT apps in one place.',
    description: 'NontHub for Windows by Void.',
    category: 'HUB', kind: 'github', repo: NONTHUB_REPO,
    featured: true, icon: Boxes, iconUrl: NONTHUB_LOGO,
  },
  {
    id: 'nontmusic', name: 'NontMusic', subtitle: 'Music, connected.',
    description: 'NontMusic Windows music player',
    category: 'MUSIC', kind: 'github', repo: NONTMUSIC_REPO,
    featured: true, icon: Music2, iconUrl: NONTMUSIC_LOGO,
  },
  {
    id: 'veil-browser', name: 'Veil Browser', subtitle: 'Private by design.',
    description: 'A privacy-first desktop browser powered by the independent Veil Engine.',
    category: 'WEB', kind: 'github', repo: VEIL_REPO,
    featured: true, icon: Boxes, iconUrl: VEIL_LOGO,
  },
];

const catalog = [
  ...desktopApps,
  {
    id: 'nontmusic-web', name: 'NontMusic Web', subtitle: 'Play in your browser.',
    description: 'Open the browser version of NontMusic at music.nont.me.',
    category: 'MUSIC', kind: 'web', route: 'https://music.nont.me',
    featured: true, icon: Music2, iconUrl: NONTMUSIC_LOGO, versionRepo: NONTMUSIC_REPO,
  },
];

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
}
function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
function formatSyncTime(value) {
  if (!value) return 'Not synced yet';
  try { return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return 'Synced'; }
}
function githubRepo(value) {
  try {
    const u = new URL(value.trim());
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    return owner && repo ? `${owner}/${repo.replace(/\.git$/i, '')}` : null;
  } catch { return null; }
}
function repoUrl(repo) { return `https://github.com/${repo}`; }
function startDownload(asset) { window.open(asset.url, '_blank', 'noopener,noreferrer'); }

async function fetchRepoSync(repo) {
  const response = await fetch(`/api/github-sync?repo=${encodeURIComponent(repo)}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || `Sync failed (${response.status}).`);
  return data;
}

export default function App() {
  const [page, setPage] = useState('home');
  const [installerMode, setInstallerMode] = useState('install');
  const [theme, setTheme] = useState(() => localStorage.getItem('nonthub.web.theme') || 'dark');
  const [query, setQuery] = useState('');
  const [downloads, setDownloads] = useState(() => readJson('nonthub.web.downloads', []));
  const [showAdd, setShowAdd] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [repoSync, setRepoSync] = useState(() => readJson(SYNC_CACHE_KEY, {}));
  const [installerBusy, setInstallerBusy] = useState({});
  const [syncBusy, setSyncBusy] = useState(false);
  const syncLockRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('nonthub.web.theme', theme); } catch { /* no-op */ }
  }, [theme]);
  useEffect(() => writeJson('nonthub.web.downloads', downloads.slice(0, 100)), [downloads]);
  useEffect(() => {
    const cacheable = Object.fromEntries(Object.entries(repoSync).map(([repo, value]) => [repo, { ...value, status: value?.status === 'checking' ? 'ready' : value?.status }]));
    writeJson(SYNC_CACHE_KEY, cacheable);
  }, [repoSync]);
  useEffect(() => { void syncAll(); }, []);

  const visibleApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((app) => `${app.name} ${app.subtitle} ${app.description} ${app.category}`.toLowerCase().includes(q)) : catalog;
  }, [query]);

  async function syncOne(app) {
    if (!app?.repo) return null;
    setRepoSync((state) => ({ ...state, [app.repo]: { ...(state[app.repo] || {}), status: 'checking', error: '' } }));
    try {
      const data = { ...(await fetchRepoSync(app.repo)), syncedAt: new Date().toISOString() };
      setRepoSync((state) => ({ ...state, [app.repo]: data }));
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let failed;
      setRepoSync((state) => {
        failed = {
          ...(state[app.repo] || {}),
          status: 'error', repo: app.repo,
          sourceVersion: state[app.repo]?.sourceVersion || repoConfigs[app.repo]?.fallbackVersion || '',
          error: message,
        };
        return { ...state, [app.repo]: failed };
      });
      return failed || { status: 'error', repo: app.repo, sourceVersion: repoConfigs[app.repo]?.fallbackVersion || '', error: message };
    }
  }

  async function syncAll() {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncBusy(true);
    try { await Promise.all(desktopApps.map((app) => syncOne(app))); }
    finally {
      syncLockRef.current = false;
      setSyncBusy(false);
    }
  }

  function appVersion(app) {
    const repo = app.repo || app.versionRepo;
    return repoSync[repo]?.sourceVersion || repoConfigs[repo]?.fallbackVersion || VERSION;
  }

  function openApp(app) {
    if (app.kind === 'web') { window.location.href = app.route; return; }
    setInstallerMode('install');
    setPage('installer');
  }

  async function installerAction(app, mode) {
    if (installerBusy[app.repo]) return;
    setInstallerBusy((state) => ({ ...state, [app.repo]: true }));
    try {
      let synced = repoSync[app.repo];
      if (!synced || synced.status === 'error' || (!synced.asset && !synced.releaseUrl)) synced = await syncOne(app);
      if (synced?.asset) {
        startDownload(synced.asset);
        setDownloads((items) => [{
          id: crypto.randomUUID(), name: synced.asset.name, repo: app.repo,
          size: synced.asset.size, status: 'opened', action: mode,
          date: Date.now(), url: synced.asset.url,
        }, ...items]);
      } else {
        window.open(synced?.releaseUrl || repoUrl(app.repo), '_blank', 'noopener,noreferrer');
      }
    } finally {
      setInstallerBusy((state) => ({ ...state, [app.repo]: false }));
    }
  }

  async function addDownload(event) {
    event.preventDefault();
    if (!directUrl.trim() || addBusy) return;
    setAddBusy(true);
    try {
      const repo = githubRepo(directUrl);
      let asset;
      if (repo) {
        const canonical = Object.keys(repoConfigs).find((key) => key.toLowerCase() === repo.toLowerCase());
        if (!canonical) throw new Error('Only official NONT repositories can be resolved automatically here.');
        const synced = await fetchRepoSync(canonical);
        asset = synced.asset;
        if (!asset) throw new Error('No published Windows installer is available in this repository yet.');
      } else {
        const url = new URL(directUrl.trim());
        if (url.protocol !== 'https:') throw new Error('Direct downloads must use HTTPS.');
        asset = { name: decodeURIComponent(url.pathname.split('/').pop() || 'download'), url: url.toString(), size: 0 };
      }
      startDownload(asset);
      setDownloads((items) => [{ id: crypto.randomUUID(), name: asset.name, repo, size: asset.size, status: 'opened', action: 'download', date: Date.now(), url: asset.url }, ...items]);
      setShowAdd(false);
      setDirectUrl('');
      setPage('downloads');
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setAddBusy(false);
    }
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('home')}>
        <span className="brand-mark"><img src={NONTHUB_LOGO} alt="NontHub" /></span>
        <span><strong>NONT</strong><small>HUB</small></span>
      </button>
      <div className="sidebar-label">NONTHUB WEB</div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><Icon size={18}/><span>{label}</span>{id === 'downloads' && downloads.length > 0 && <b>{downloads.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="mini"><span><img className="mini-app-icon" src={VEIL_LOGO} alt="Veil Browser"/></span><div><strong>Veil Browser</strong><small>GitHub synced · v{appVersion(desktopApps[2])}</small></div><ChevronRight size={16}/></div>
        <div className="status"><i/> {syncBusy ? 'Syncing GitHub…' : 'GitHub synced'}</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your app library"/></div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === 'bright' ? 'dark' : 'bright')}>{theme === 'bright' ? <Moon size={17}/> : <Sun size={17}/>}</button>
          <button className="secondary compact" disabled={syncBusy} onClick={() => void syncAll()}><RefreshCw className={syncBusy ? 'spin' : ''} size={16}/> {syncBusy ? 'Syncing…' : 'Sync GitHub'}</button>
          <button className="primary compact" onClick={() => { setInstallerMode('install'); setPage('installer'); }}><PackageOpen size={16}/> Installer</button>
        </div>
      </header>

      {page === 'home' && <section className="content">
        <div className="hero">
          <div>
            <div className="eyebrow"><i/> NONT ECOSYSTEM · v{VERSION}</div>
            <h1>Your apps.<br/><em>One signal.</em></h1>
            <p>NontHub keeps NontMusic and Veil Browser connected to their GitHub source, with one place to install the latest published Windows builds.</p>
            <div className="hero-actions">
              <button className="primary" onClick={() => setPage('library')}><Boxes size={18}/> Open library</button>
              <button className="secondary" onClick={() => { setInstallerMode('install'); setPage('installer'); }}><PackageOpen size={18}/> Open installer</button>
            </div>
          </div>
          <div className="signal"><span/><span/><div className="signal-core"><img src={NONTHUB_LOGO} alt="NontHub"/></div><div className="bars">{Array.from({length:21}).map((_,i)=><i key={i} style={{height:`${18+((i*17)%48)}px`}}/> )}</div></div>
        </div>
        <div className="home-split">
          <div><Title title="Featured" subtitle="Live versions are synced from GitHub"/><div className="app-grid">{visibleApps.filter((app)=>app.featured).map((app)=><AppCard key={app.id} app={app} version={appVersion(app)} sync={repoSync[app.repo || app.versionRepo]} onOpen={()=>openApp(app)}/>)}</div></div>
          <aside className="pulse">
            <span className="category">SYSTEM</span><h3>NONT pulse</h3>
            <Pulse icon={<img className="pulse-app-icon" src={NONTHUB_LOGO} alt=""/>} label="NontHub" value={`v${appVersion(desktopApps[0])}`}/>
            <Pulse icon={<img className="pulse-app-icon" src={NONTMUSIC_LOGO} alt=""/>} label="NontMusic" value={`v${appVersion(desktopApps[1])}`}/>
            <Pulse icon={<img className="pulse-app-icon" src={VEIL_LOGO} alt=""/>} label="Veil Browser" value={`v${appVersion(desktopApps[2])}`}/>
            <button className="ghost" onClick={()=>{setInstallerMode('update');setPage('installer');}}>Install or update apps <ChevronRight size={14}/></button>
          </aside>
        </div>
      </section>}

      {page === 'library' && <section className="content">
        <Title title="Library" subtitle="NontHub, NontMusic and Veil Browser stay synced with their GitHub repositories."/>
        <div className="app-grid all">{visibleApps.map((app)=><AppCard key={app.id} app={app} version={appVersion(app)} sync={repoSync[app.repo || app.versionRepo]} onOpen={()=>openApp(app)}/>)}</div>
      </section>}

      {page === 'downloads' && <section className="content">
        <Title title="Downloads" subtitle="Files opened from GitHub Releases or direct HTTPS links." action={<><button className="secondary compact" onClick={()=>setDownloads([])}><Trash2 size={15}/> Clear</button><button className="secondary compact" onClick={()=>setShowAdd(true)}><Plus size={15}/> New</button></>}/>
        {downloads.length===0?<Empty onAdd={()=>setShowAdd(true)}/>:<div className="downloads">{downloads.map((item)=><div className="download-row" key={item.id}><span className="download-icon"><CheckCircle2 size={20}/></span><div><strong>{item.name}</strong><small>{item.repo ? `GitHub · ${item.repo}` : 'Direct download'}{item.size ? ` · ${formatBytes(item.size)}`:''}</small><p>{item.action === 'update' ? 'Latest installer opened for update.' : item.action === 'install' ? 'Latest installer opened for installation.' : 'Opened in your browser download flow.'}</p></div><button className="icon-button" aria-label={`Open ${item.name}`} onClick={()=>window.open(item.url,'_blank','noopener,noreferrer')}><ExternalLink size={16}/></button></div>)}</div>}
      </section>}

      {page === 'installer' && <section className="content">
        <Title title="Installer" subtitle="Install a NONT app or update an existing copy using the latest published GitHub installer." action={<button className="secondary compact" disabled={syncBusy} onClick={() => void syncAll()}><RefreshCw className={syncBusy ? 'spin' : ''} size={15}/> Refresh GitHub</button>}/>
        <div className="theme-grid" role="tablist" aria-label="Installer mode">
          <button type="button" role="tab" aria-selected={installerMode === 'install'} className={installerMode === 'install' ? 'active' : ''} onClick={()=>setInstallerMode('install')}><PackageOpen size={19}/><strong>Install</strong>{installerMode === 'install' && <Check size={15}/>}</button>
          <button type="button" role="tab" aria-selected={installerMode === 'update'} className={installerMode === 'update' ? 'active' : ''} onClick={()=>setInstallerMode('update')}><RefreshCw size={19}/><strong>Update</strong>{installerMode === 'update' && <Check size={15}/>}</button>
        </div>
        <div className="notice"><ShieldCheck size={19}/><div><strong>{installerMode === 'install' ? 'Install latest published build' : 'Update your current installation'}</strong><p>{installerMode === 'install' ? 'NontHub checks GitHub for the newest Windows installer and opens it in your browser.' : 'Choose the app you already have installed. NontHub opens the newest published installer so it can replace or update your current version.'}</p></div></div>
        <div className="update-stack">{desktopApps.map((app)=><InstallerCard key={app.id} app={app} mode={installerMode} sync={repoSync[app.repo]} busy={Boolean(installerBusy[app.repo])} onSync={()=>void syncOne(app)} onAction={()=>void installerAction(app, installerMode)}/>)}</div>
      </section>}

      {page === 'settings' && <section className="content">
        <Title title="Settings" subtitle="Appearance and GitHub sync behavior for NontHub Web."/>
        <SettingSection icon={<Sun size={18}/>} title="Appearance" subtitle="Choose the NontHub dark or bright theme."><div className="theme-grid"><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon size={19}/><strong>Dark</strong>{theme==='dark'&&<Check size={15}/>}</button><button className={theme==='bright'?'active':''} onClick={()=>setTheme('bright')}><Sun size={19}/><strong>Bright</strong>{theme==='bright'&&<Check size={15}/>}</button></div></SettingSection>
        <SettingSection icon={<RefreshCw size={18}/>} title="GitHub sync" subtitle="Versions and published installers come directly from each official repository."><div className="setting-row"><div><strong>Automatic sync</strong><p>The page restores the last successful versions instantly, then refreshes NontHub, NontMusic and Veil Browser through the cached nont.me sync endpoint.</p></div><span>{syncBusy ? 'Syncing' : 'Enabled'}</span></div></SettingSection>
      </section>}
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={()=>!addBusy&&setShowAdd(false)}><form className="modal" onSubmit={addDownload} onMouseDown={(e)=>e.stopPropagation()}><div className="modal-title"><div><small>DOWNLOAD</small><h2>Add download</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={()=>setShowAdd(false)}><X size={17}/></button></div><label>HTTPS URL or official GitHub repository</label><input autoFocus value={directUrl} onChange={(e)=>setDirectUrl(e.target.value)} placeholder="https://github.com/voidnont/NontMusic"/><p>{githubRepo(directUrl)?`GitHub repository detected · ${githubRepo(directUrl)}`:'Direct files must use HTTPS. Official NONT repositories resolve to the newest published Windows installer.'}</p><button className="primary full" disabled={addBusy||!directUrl.trim()}>{addBusy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>} Resolve & download</button></form></div>}
  </div>;
}

function Title({ title, subtitle, action }) {
  return <div className="section-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action&&<div className="section-actions">{action}</div>}</div>;
}
function Pulse({ icon, label, value }) {
  return <div className="pulse-row"><span>{icon}</span><div><strong>{label}</strong><small>{value}</small></div></div>;
}
function AppCard({ app, onOpen, version, sync }) {
  const Icon = app.icon;
  const actionLabel = app.kind === 'web' ? 'Open' : 'Installer';
  return <article className="app-card"><div className="app-card-top"><span className="app-icon">{app.iconUrl ? <img className="real-app-icon" src={app.iconUrl} alt={`${app.name} icon`}/> : <Icon size={27}/>}</span><span className="version-chip">v{version}</span></div><div className="app-copy"><span className="category">{app.category}</span><h3>{app.name}</h3><strong>{app.subtitle}</strong><p>{sync?.description || app.description}</p></div><button className="secondary full" onClick={onOpen}>{app.kind==='web'?<ChevronRight size={16}/>:<PackageOpen size={16}/>} {actionLabel}</button></article>;
}
function InstallerCard({ app, mode, sync, busy, onSync, onAction }) {
  const version = sync?.sourceVersion || repoConfigs[app.repo]?.fallbackVersion || '—';
  const releaseVersion = sync?.releaseVersion;
  const hasInstaller = Boolean(sync?.asset);
  const checking = sync?.status === 'checking';
  const primaryLabel = hasInstaller ? `${mode === 'install' ? 'Install' : 'Update'} ${app.name}` : 'Open releases';
  return <article className="update-card"><span className="update-icon"><img src={app.iconUrl} alt={`${app.name} icon`}/></span><div><span className="category">GITHUB SYNCED</span><h3>{app.name}</h3><p>{app.repo}</p><div className="version-line"><span>Source</span><strong>v{version}</strong><i>→</i><span>Installer</span><strong>{releaseVersion ? `v${releaseVersion}` : 'Not published'}</strong></div>{sync?.sourceAheadOfRelease&&<small className="error-text">Source v{version} is newer than the published installer. Installer stays on v{releaseVersion} until a new GitHub Release is published.</small>}{sync?.asset&&<small className="asset-line"><FileArchive size={12}/> {sync.asset.name} · {formatBytes(sync.asset.size)}</small>}{sync?.status==='error'&&<small className="error-text">Sync failed: {sync.error}</small>}{sync?.status==='ready'&&!hasInstaller&&<small className="asset-line">No Windows installer is published in GitHub Releases yet.</small>}{sync?.syncedAt&&<small className="asset-line">Last synced {formatSyncTime(sync.syncedAt)}</small>}</div><div className="update-actions"><button className="secondary" onClick={onSync} disabled={checking||busy}><RefreshCw className={checking?'spin':''} size={15}/> Sync</button><button className="primary" onClick={onAction} disabled={checking||busy}>{busy?<LoaderCircle className="spin" size={15}/>:hasInstaller?<ArrowDownToLine size={15}/>:<ExternalLink size={15}/>} {busy?'Opening…':primaryLabel}</button></div></article>;
}
function Empty({ onAdd }) {
  return <div className="empty"><Download size={27}/><h3>No downloads yet</h3><p>Install an app or add a direct download.</p><button className="primary" onClick={onAdd}><Plus size={16}/> Add download</button></div>;
}
function SettingSection({ icon, title, subtitle, children }) {
  return <section className="settings-section"><div className="settings-heading"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div><div className="settings-body">{children}</div></section>;
}
