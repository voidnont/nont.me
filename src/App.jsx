import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, Boxes, Check, CheckCircle2, ChevronRight,
  Download, ExternalLink, FileArchive, Home, Library,
  LoaderCircle, Moon, Music2, PackageOpen, Plus, RefreshCw, Search,
  Settings, ShieldCheck, Sun, Trash2, X,
} from 'lucide-react';

const VERSION = '0.7.1';
const NONTHUB_REPO = 'voidnont/NontHub';
const NONTMUSIC_REPO = 'voidnont/NontMusic';
const VEIL_REPO = 'voidnont/veilbrowser';

const NONTHUB_LOGO = 'https://raw.githubusercontent.com/voidnont/NontHub/main/public/nonthub-logo.png';
const NONTMUSIC_LOGO = 'https://raw.githubusercontent.com/voidnont/NontMusic/main/public/nontmusic.png';
const VEIL_LOGO = 'https://raw.githubusercontent.com/voidnont/veilbrowser/main/assets/veil-glass-icon.png';

const repoConfigs = {
  [NONTHUB_REPO]: { source: 'package.json', type: 'package', fallbackVersion: '3.0.1' },
  [NONTMUSIC_REPO]: { source: 'package.json', type: 'package', fallbackVersion: '0.7.3' },
  [VEIL_REPO]: { source: 'Cargo.toml', type: 'cargo', fallbackVersion: '0.8.0' },
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
    description: 'The Windows hub for NONT apps, downloads and installation.',
    category: 'HUB', kind: 'github', repo: NONTHUB_REPO, extensions: ['.msi', '.exe'],
    featured: true, icon: Boxes, iconUrl: NONTHUB_LOGO,
  },
  {
    id: 'nontmusic', name: 'NontMusic', subtitle: 'Music, connected.',
    description: 'The NONT desktop music player with the latest features from GitHub.',
    category: 'MUSIC', kind: 'github', repo: NONTMUSIC_REPO, extensions: ['.exe', '.msi'],
    featured: true, icon: Music2, iconUrl: NONTMUSIC_LOGO,
  },
  {
    id: 'veil-browser', name: 'Veil Browser', subtitle: 'Private by design.',
    description: 'A privacy-first desktop browser powered by the independent Veil Engine.',
    category: 'WEB', kind: 'github', repo: VEIL_REPO, extensions: ['.exe', '.msi'],
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
function cleanVersion(value = '') { return String(value).trim().replace(/^v/i, ''); }
function packageType(name = '') { return name.split('.').pop()?.toLowerCase() || 'file'; }
function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
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

async function fetchSourceVersion(repo) {
  const config = repoConfigs[repo];
  if (!config) return '';
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/main/${config.source}`, { cache: 'no-store' });
  if (!response.ok) return '';
  const text = await response.text();
  if (config.type === 'package') {
    try { return cleanVersion(JSON.parse(text).version || ''); } catch { return ''; }
  }
  const match = text.match(/^version\s*=\s*["']([^"']+)["']/m);
  return cleanVersion(match?.[1] || '');
}

async function fetchRepoSync(repo, extensions = ['.exe', '.msi']) {
  const [metaResponse, releasesResponse, sourceVersion] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }),
    fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }),
    fetchSourceVersion(repo),
  ]);

  const meta = metaResponse.ok ? await metaResponse.json() : null;
  const releases = releasesResponse.ok ? await releasesResponse.json() : [];
  const published = Array.isArray(releases) ? releases.find((release) => !release.draft) : null;
  const lowered = extensions.map((x) => x.toLowerCase());
  const releaseAssets = published?.assets || [];
  const asset = releaseAssets.find((item) => lowered.some((ext) => item.name.toLowerCase().endsWith(ext)))
    || releaseAssets.find((item) => !/\.(sha\d*|md5)(sum)?$/i.test(item.name))
    || null;

  return {
    status: 'ready',
    repo,
    description: meta?.description || '',
    pushedAt: meta?.pushed_at || '',
    sourceVersion: sourceVersion || repoConfigs[repo]?.fallbackVersion || '',
    releaseVersion: cleanVersion(published?.tag_name || published?.name || ''),
    releaseUrl: published?.html_url || `${repoUrl(repo)}/releases`,
    asset: asset ? {
      id: asset.id,
      name: asset.name,
      size: asset.size,
      url: asset.browser_download_url,
      type: packageType(asset.name),
    } : null,
  };
}

function startDownload(asset) {
  window.open(asset.url, '_blank', 'noopener,noreferrer');
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
  const [repoSync, setRepoSync] = useState({});
  const [installerBusy, setInstallerBusy] = useState({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('nonthub.web.theme', theme);
  }, [theme]);
  useEffect(() => localStorage.setItem('nonthub.web.downloads', JSON.stringify(downloads.slice(0, 100))), [downloads]);
  useEffect(() => { void syncAll(); }, []);

  const visibleApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((app) => `${app.name} ${app.subtitle} ${app.description} ${app.category}`.toLowerCase().includes(q)) : catalog;
  }, [query]);

  async function syncOne(app) {
    if (!app?.repo) return null;
    setRepoSync((state) => ({ ...state, [app.repo]: { ...(state[app.repo] || {}), status: 'checking' } }));
    try {
      const data = await fetchRepoSync(app.repo, app.extensions);
      setRepoSync((state) => ({ ...state, [app.repo]: data }));
      return data;
    } catch (error) {
      const failed = {
        status: 'error', repo: app.repo,
        sourceVersion: repoConfigs[app.repo]?.fallbackVersion || '',
        error: String(error), asset: null,
      };
      setRepoSync((state) => ({ ...state, [app.repo]: failed }));
      return failed;
    }
  }

  async function syncAll() {
    await Promise.all(desktopApps.map((app) => syncOne(app)));
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
      if (!synced || synced.status !== 'ready') synced = await syncOne(app);
      if (synced?.asset) {
        startDownload(synced.asset);
        setDownloads((items) => [{
          id: crypto.randomUUID(),
          name: synced.asset.name,
          repo: app.repo,
          size: synced.asset.size,
          status: 'opened',
          action: mode,
          date: Date.now(),
          url: synced.asset.url,
        }, ...items]);
      } else {
        window.open(repoUrl(app.repo), '_blank', 'noopener,noreferrer');
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
        const app = desktopApps.find((item) => item.repo.toLowerCase() === repo.toLowerCase()) || { repo, extensions: ['.exe', '.msi'] };
        const synced = await fetchRepoSync(repo, app.extensions);
        asset = synced.asset;
        if (!asset) throw new Error('No published Windows installer is available in this repository yet.');
      } else {
        asset = { name: decodeURIComponent(directUrl.split('/').pop()?.split('?')[0] || 'download'), url: directUrl, size: 0 };
      }
      startDownload(asset);
      setDownloads((items) => [{ id: crypto.randomUUID(), name: asset.name, repo, size: asset.size, status: 'opened', action: 'download', date: Date.now(), url: asset.url }, ...items]);
      setShowAdd(false);
      setDirectUrl('');
      setPage('downloads');
    } catch (error) {
      alert(String(error));
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
        <div className="status"><i/> GitHub synced</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your app library"/></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setTheme(theme === 'bright' ? 'dark' : 'bright')}>{theme === 'bright' ? <Moon size={17}/> : <Sun size={17}/>}</button>
          <button className="secondary compact" onClick={() => void syncAll()}><RefreshCw size={16}/> Sync GitHub</button>
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
        <Title title="Downloads" subtitle="Files opened from GitHub Releases or direct links." action={<><button className="secondary compact" onClick={()=>setDownloads([])}><Trash2 size={15}/> Clear</button><button className="secondary compact" onClick={()=>setShowAdd(true)}><Plus size={15}/> New</button></>}/>
        {downloads.length===0?<Empty onAdd={()=>setShowAdd(true)}/>:<div className="downloads">{downloads.map((item)=><div className="download-row" key={item.id}><span className="download-icon"><CheckCircle2 size={20}/></span><div><strong>{item.name}</strong><small>{item.repo ? `GitHub · ${item.repo}` : 'Direct download'}{item.size ? ` · ${formatBytes(item.size)}`:''}</small><p>{item.action === 'update' ? 'Latest installer opened for update.' : item.action === 'install' ? 'Latest installer opened for installation.' : 'Opened in your browser download flow.'}</p></div><button className="icon-button" onClick={()=>window.open(item.url,'_blank','noopener,noreferrer')}><ExternalLink size={16}/></button></div>)}</div>}
      </section>}

      {page === 'installer' && <section className="content">
        <Title title="Installer" subtitle="Install a NONT app or update an existing copy using the latest published GitHub installer." action={<button className="secondary compact" onClick={() => void syncAll()}><RefreshCw size={15}/> Refresh GitHub</button>}/>
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
        <SettingSection icon={<RefreshCw size={18}/>} title="GitHub sync" subtitle="Versions and published installers come directly from each official repository."><div className="setting-row"><div><strong>Automatic sync</strong><p>The page checks NontHub, NontMusic and Veil Browser on load. Use Sync GitHub any time you want to refresh immediately.</p></div><span>Enabled</span></div></SettingSection>
      </section>}
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={()=>!addBusy&&setShowAdd(false)}><form className="modal" onSubmit={addDownload} onMouseDown={(e)=>e.stopPropagation()}><div className="modal-title"><div><small>DOWNLOAD</small><h2>Add download</h2></div><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}><X size={17}/></button></div><label>Direct URL or GitHub repository</label><input autoFocus value={directUrl} onChange={(e)=>setDirectUrl(e.target.value)} placeholder="https://github.com/owner/project"/><p>{githubRepo(directUrl)?`GitHub repository detected · ${githubRepo(directUrl)}`:'Paste a normal HTTPS file URL or a GitHub repository. For repositories, NontHub resolves the latest published Windows installer.'}</p><button className="primary full" disabled={addBusy||!directUrl.trim()}>{addBusy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>} Resolve & download</button></form></div>}
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
  const primaryLabel = hasInstaller ? `${mode === 'install' ? 'Install' : 'Update'} ${app.name}` : 'Open GitHub';
  return <article className="update-card"><span className="update-icon"><img src={app.iconUrl} alt={`${app.name} icon`}/></span><div><span className="category">GITHUB SYNCED</span><h3>{app.name}</h3><p>{app.repo}</p><div className="version-line"><span>Source</span><strong>v{version}</strong><i>→</i><span>Installer</span><strong>{releaseVersion ? `v${releaseVersion}` : 'Not published'}</strong></div>{sync?.asset&&<small className="asset-line"><FileArchive size={12}/> {sync.asset.name} · {formatBytes(sync.asset.size)}</small>}{sync?.status==='error'&&<small className="error-text">Could not sync right now. Using the last known source version.</small>}{sync?.status==='ready'&&!hasInstaller&&<small className="asset-line">No Windows installer is published in GitHub Releases yet.</small>}</div><div className="update-actions"><button className="secondary" onClick={onSync} disabled={checking||busy}><RefreshCw className={checking?'spin':''} size={15}/> Sync</button><button className="primary" onClick={onAction} disabled={checking||busy}>{busy?<LoaderCircle className="spin" size={15}/>:hasInstaller?<ArrowDownToLine size={15}/>:<ExternalLink size={15}/>} {busy?'Opening…':primaryLabel}</button></div></article>;
}
function Empty({ onAdd }) {
  return <div className="empty"><Download size={27}/><h3>No downloads yet</h3><p>Install an app or add a direct download.</p><button className="primary" onClick={onAdd}><Plus size={16}/> Add download</button></div>;
}
function SettingSection({ icon, title, subtitle, children }) {
  return <section className="settings-section"><div className="settings-heading"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div><div className="settings-body">{children}</div></section>;
}
