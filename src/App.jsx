import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, Bot, Boxes, Check, CheckCircle2, ChevronRight, Cloud, Code2,
  Download, ExternalLink, FileArchive, Globe2, Home, KeyRound, Library,
  LoaderCircle, Moon, Music2, PackageOpen, Plus, RefreshCw, Search, Send,
  Settings, ShieldCheck, Sparkles, Sun, Trash2, X, XCircle,
} from 'lucide-react';

const VERSION = '1.0.0';
const NEXUS_REPO = 'voidnont/NONT-Nexus';
const NONT_REPO = 'voidnont/nont';
const LOGO = 'https://raw.githubusercontent.com/voidnont/NONT-Nexus/main/public/nexus-logo.png';

const nav = [
  ['home', 'Home', Home], ['library', 'Library', Library], ['downloads', 'Downloads', Download],
  ['web-search', 'Web Search', Globe2], ['ai-chat', 'AI Chat', Bot], ['updates', 'Updates', RefreshCw],
  ['settings', 'Settings', Settings],
];

const catalog = [
  { id: 'nont', name: 'NONT', subtitle: 'Music, connected.', description: 'The NONT music player and the center of the NONT ecosystem.', category: 'MUSIC', kind: 'github', repo: NONT_REPO, extensions: ['.exe'], featured: true, icon: Music2 },
  { id: 'nexus-ai', name: 'Nexus AI', subtitle: 'One place for your models.', description: 'Bring your own cloud API key and chat directly inside Nexus.', category: 'AI', kind: 'builtin', route: 'ai-chat', featured: true, icon: Bot },
  { id: 'web-search', name: 'Web Search', subtitle: 'Search without leaving Nexus.', description: 'Search the public web, inspect results and open sources.', category: 'WEB', kind: 'builtin', route: 'web-search', icon: Globe2 },
  { id: 'downloads', name: 'Downloads', subtitle: 'Release files in one place.', description: 'Open direct downloads and GitHub Release assets from Nexus.', category: 'TOOLS', kind: 'builtin', route: 'downloads', icon: Download },
];

const presets = [
  ['OpenAI', 'https://api.openai.com/v1', 'gpt-5.6'],
  ['OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-5.6'],
  ['Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-3.8-flash'],
  ['Groq', 'https://api.groq.com/openai/v1', ''],
  ['Together', 'https://api.together.xyz/v1', ''],
];

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; }
}
function cleanVersion(v = '') { return String(v).trim().replace(/^v/i, ''); }
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
    if (u.hostname !== 'github.com') return null;
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    return owner && repo ? `${owner}/${repo.replace(/\.git$/i, '')}` : null;
  } catch { return null; }
}
async function latestAssets(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const releases = (await response.json()).filter((release) => !release.draft);
  const release = releases.find((item) => item.assets?.length);
  if (!release) throw new Error('No published GitHub release with assets was found.');
  return release.assets.map((asset) => ({
    name: asset.name, url: asset.browser_download_url, size: asset.size, id: asset.id,
    version: cleanVersion(release.tag_name || release.name || ''), tag: release.tag_name,
    prerelease: Boolean(release.prerelease), type: packageType(asset.name),
  }));
}
async function resolveAsset(repo, extensions = []) {
  const assets = await latestAssets(repo);
  const lowered = extensions.map((x) => x.toLowerCase());
  const picked = assets.find((a) => lowered.some((ext) => a.name.toLowerCase().endsWith(ext))) || assets.find((a) => !/\.(sha\d*|md5)(sum)?$/i.test(a.name));
  if (!picked) throw new Error('No compatible release asset found.');
  return picked;
}
function startDownload(asset) {
  window.open(asset.url, '_blank', 'noopener,noreferrer');
}

export default function App() {
  const [page, setPage] = useState('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('nexus.web.theme') || 'dark');
  const [query, setQuery] = useState('');
  const [downloads, setDownloads] = useState(() => readJson('nexus.web.downloads', []));
  const [showAdd, setShowAdd] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [releaseChecks, setReleaseChecks] = useState({});
  const [webQuery, setWebQuery] = useState('');
  const [webResults, setWebResults] = useState([]);
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState('');
  const [providers, setProviders] = useState(() => readJson('nexus.web.providers', []));
  const [activeProvider, setActiveProvider] = useState(() => localStorage.getItem('nexus.web.activeProvider') || '');
  const [messages, setMessages] = useState(() => readJson('nexus.web.messages', []));
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [preset, setPreset] = useState(0);
  const [providerName, setProviderName] = useState(presets[0][0]);
  const [providerUrl, setProviderUrl] = useState(presets[0][1]);
  const [providerModel, setProviderModel] = useState(presets[0][2]);
  const [providerKey, setProviderKey] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('nexus.web.theme', theme);
  }, [theme]);
  useEffect(() => localStorage.setItem('nexus.web.downloads', JSON.stringify(downloads.slice(0, 100))), [downloads]);
  useEffect(() => localStorage.setItem('nexus.web.providers', JSON.stringify(providers)), [providers]);
  useEffect(() => localStorage.setItem('nexus.web.messages', JSON.stringify(messages.slice(-80))), [messages]);
  useEffect(() => localStorage.setItem('nexus.web.activeProvider', activeProvider), [activeProvider]);

  const visibleApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((app) => `${app.name} ${app.subtitle} ${app.description} ${app.category}`.toLowerCase().includes(q)) : catalog;
  }, [query]);
  const selectedProvider = providers.find((p) => p.id === activeProvider);

  async function checkRepo(repo, extensions) {
    setReleaseChecks((x) => ({ ...x, [repo]: { status: 'checking' } }));
    try {
      const asset = await resolveAsset(repo, extensions);
      setReleaseChecks((x) => ({ ...x, [repo]: { status: 'ready', asset } }));
    } catch (error) {
      setReleaseChecks((x) => ({ ...x, [repo]: { status: 'error', error: String(error) } }));
    }
  }

  async function installApp(app) {
    if (app.kind === 'builtin') return setPage(app.route);
    setReleaseChecks((x) => ({ ...x, [app.repo]: { status: 'checking' } }));
    try {
      const asset = await resolveAsset(app.repo, app.extensions);
      startDownload(asset);
      setDownloads((items) => [{ id: crypto.randomUUID(), name: asset.name, repo: app.repo, size: asset.size, status: 'opened', date: Date.now(), url: asset.url }, ...items]);
      setReleaseChecks((x) => ({ ...x, [app.repo]: { status: 'ready', asset } }));
      setPage('downloads');
    } catch (error) {
      setReleaseChecks((x) => ({ ...x, [app.repo]: { status: 'error', error: String(error) } }));
    }
  }

  async function addDownload(event) {
    event.preventDefault();
    if (!directUrl.trim() || addBusy) return;
    setAddBusy(true);
    try {
      const repo = githubRepo(directUrl);
      let asset;
      if (repo) asset = await resolveAsset(repo, navigator.userAgent.includes('Windows') ? ['.exe', '.msi'] : []);
      else asset = { name: decodeURIComponent(directUrl.split('/').pop()?.split('?')[0] || 'download'), url: directUrl, size: 0 };
      startDownload(asset);
      setDownloads((items) => [{ id: crypto.randomUUID(), name: asset.name, repo, size: asset.size, status: 'opened', date: Date.now(), url: asset.url }, ...items]);
      setShowAdd(false); setDirectUrl(''); setPage('downloads');
    } catch (error) { alert(String(error)); }
    finally { setAddBusy(false); }
  }

  async function searchWeb(event) {
    event.preventDefault();
    const text = webQuery.trim(); if (!text || webBusy) return;
    setWebBusy(true); setWebError('');
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(text)}&limit=10`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Search failed');
      setWebResults(data.results || []);
    } catch (error) { setWebResults([]); setWebError(String(error)); }
    finally { setWebBusy(false); }
  }

  function applyPreset(index) {
    setPreset(index); const [name, url, model] = presets[index];
    setProviderName(name); setProviderUrl(url); setProviderModel(model);
  }

  function saveProvider(event) {
    event.preventDefault();
    if (!providerName.trim() || !providerUrl.trim() || !providerModel.trim() || !providerKey.trim()) return alert('Name, URL, model and API key are required.');
    const id = crypto.randomUUID();
    const next = [...providers, { id, name: providerName.trim(), baseUrl: providerUrl.trim().replace(/\/$/, ''), model: providerModel.trim(), apiKey: providerKey.trim() }];
    setProviders(next); setActiveProvider(id); setProviderKey('');
  }

  function removeProvider(id) {
    setProviders((items) => items.filter((p) => p.id !== id));
    if (activeProvider === id) setActiveProvider('');
  }

  async function submitChat(event) {
    event.preventDefault();
    const text = chatInput.trim(); if (!text || chatBusy) return;
    if (!selectedProvider) return alert('Add and select a cloud provider in Settings first.');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setChatInput(''); setChatBusy(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseUrl: selectedProvider.baseUrl, model: selectedProvider.model, apiKey: selectedProvider.apiKey, messages: next.slice(-18) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'AI request failed');
      setMessages((items) => [...items, { role: 'assistant', content: data.text }]);
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', content: `Error: ${String(error)}` }]);
    } finally { setChatBusy(false); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage('home')}><span className="brand-mark"><img src={LOGO} alt="" /></span><span><strong>NONT</strong><small>NEXUS</small></span></button>
      <div className="sidebar-label">NEXUS WEB</div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}><Icon size={18}/><span>{label}</span>{id === 'downloads' && downloads.length > 0 && <b>{downloads.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mini"><span><Music2 size={17}/></span><div><strong>NONT</strong><small>Web download ready</small></div><ChevronRight size={16}/></div><div className="status"><i/> Nexus online</div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Nexus library"/></div><div className="top-actions"><button className="icon-button" onClick={() => setTheme(theme === 'bright' ? 'dark' : 'bright')}>{theme === 'bright' ? <Moon size={17}/> : <Sun size={17}/>}</button><button className="primary compact" onClick={() => setShowAdd(true)}><Plus size={16}/> Add download</button></div></header>

      {page === 'home' && <section className="content">
        <div className="hero"><div><div className="eyebrow"><i/> NONT ECOSYSTEM · WEB</div><h1>Your apps.<br/><em>One signal.</em></h1><p>NONT Nexus, adapted for the browser: releases, downloads, search and cloud AI in one responsive home.</p><div className="hero-actions"><button className="primary" onClick={() => setPage('library')}><Boxes size={18}/> Open library</button><button className="secondary" onClick={() => setPage('ai-chat')}><Bot size={18}/> Open Nexus AI</button></div></div><div className="signal"><span/><span/><div className="signal-core"><img src={LOGO} alt=""/></div><div className="bars">{Array.from({length:21}).map((_,i)=><i key={i} style={{height:`${18+((i*17)%48)}px`}}/> )}</div></div></div>
        <div className="home-split"><div><Title title="Featured" subtitle="The first apps and tools inside your Nexus"/><div className="app-grid">{visibleApps.filter((a)=>a.featured).map((app)=><AppCard key={app.id} app={app} busy={releaseChecks[app.repo]?.status==='checking'} onOpen={()=>installApp(app)}/>)}</div></div><aside className="pulse"><span className="category">SYSTEM</span><h3>Nexus pulse</h3><Pulse icon={<Music2 size={16}/>} label="NONT" value="Release download ready"/><Pulse icon={<Bot size={16}/>} label="AI" value={`${providers.length} cloud provider${providers.length===1?'':'s'}`}/><Pulse icon={<Download size={16}/>} label="Downloads" value={`${downloads.length} in history`}/><Pulse icon={<Globe2 size={16}/>} label="Search" value="Serverless web search"/><button className="ghost" onClick={()=>setPage('updates')}>Check ecosystem updates <ChevronRight size={14}/></button></aside></div>
      </section>}

      {page === 'library' && <section className="content"><Title title="Library" subtitle="NONT apps and Nexus tools, adapted for the web."/><div className="app-grid all">{visibleApps.map((app)=><AppCard key={app.id} app={app} busy={releaseChecks[app.repo]?.status==='checking'} onOpen={()=>installApp(app)}/>)}</div></section>}

      {page === 'downloads' && <section className="content"><Title title="Downloads" subtitle="Browser-opened files and GitHub Release assets." action={<><button className="secondary compact" onClick={()=>setDownloads([])}><Trash2 size={15}/> Clear</button><button className="secondary compact" onClick={()=>setShowAdd(true)}><Plus size={15}/> New</button></>}/>{downloads.length===0?<Empty onAdd={()=>setShowAdd(true)}/>:<div className="downloads">{downloads.map((item)=><div className="download-row" key={item.id}><span className="download-icon"><CheckCircle2 size={20}/></span><div><strong>{item.name}</strong><small>{item.repo ? `GitHub · ${item.repo}` : 'Direct download'}{item.size ? ` · ${formatBytes(item.size)}`:''}</small><p>Opened in your browser's download flow.</p></div><button className="icon-button" onClick={()=>window.open(item.url,'_blank','noopener,noreferrer')}><ExternalLink size={16}/></button></div>)}</div>}</section>}

      {page === 'web-search' && <section className="content"><Title title="Web Search" subtitle="Search the public web from Nexus."/><form className="web-search" onSubmit={searchWeb}><Globe2 size={20}/><input value={webQuery} onChange={(e)=>setWebQuery(e.target.value)} placeholder="Search the web…"/><button className="primary" disabled={webBusy}>{webBusy?<LoaderCircle className="spin" size={16}/>:<Search size={16}/>} Search</button></form>{webError&&<div className="notice error"><XCircle size={17}/>{webError}</div>}<div className="web-results">{webResults.map((r,i)=><button key={r.url+i} onClick={()=>window.open(r.url,'_blank','noopener,noreferrer')}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{r.title}</strong><small>{r.url}</small><p>{r.snippet}</p></div><ExternalLink size={16}/></button>)}</div></section>}

      {page === 'ai-chat' && <section className="content ai-page"><Title title="Nexus AI" subtitle="Cloud AI works directly on the web. Local OpenCode remains a desktop Nexus feature." action={<button className="secondary compact" onClick={()=>setMessages([])}><Plus size={15}/> New chat</button>}/><div className="opencode-card"><span><Code2 size={20}/></span><div><small>LOCAL CODING AGENT</small><strong>OpenCode</strong><p>A website cannot start or control a local OpenCode process. Use the desktop Nexus app for integrated OpenCode; use BYOK cloud providers here.</p></div><span className="state-chip">Desktop only</span></div><div className="ai-layout"><aside className="ai-rail"><label>Provider</label><select value={activeProvider} onChange={(e)=>setActiveProvider(e.target.value)}><option value="">Choose AI engine</option>{providers.map((p)=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select>{selectedProvider?<div className="cloud-summary"><Cloud size={17}/><div><strong>{selectedProvider.name}</strong><span>{selectedProvider.model}</span><small>Key stored in this browser</small></div></div>:<div className="cloud-summary"><Cloud size={17}/><div><strong>No engine selected</strong><span>Add one in Settings</span><small>BYOK cloud providers</small></div></div>}<button className="ghost" onClick={()=>setPage('settings')}>Configure AI providers <ChevronRight size={14}/></button></aside><div className="chat"><div className="chat-scroll">{messages.length===0?<div className="chat-empty"><Sparkles size={28}/><h3>Ask Nexus</h3><p>Select one of your saved providers, then start a conversation.</p></div>:messages.map((m,i)=><div className={`message ${m.role}`} key={i}><span>{m.role==='user'?'YOU':'NEXUS'}</span><p>{m.content}</p></div>)}</div><form className="composer" onSubmit={submitChat}><textarea rows="1" value={chatInput} onChange={(e)=>setChatInput(e.target.value)} placeholder={`Message ${selectedProvider?.name || 'your AI engine'}…`}/><button disabled={chatBusy||!chatInput.trim()}>{chatBusy?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>}</button></form></div></div></section>}

      {page === 'updates' && <section className="content"><Title title="Updates" subtitle="GitHub Releases remain the source of truth." action={<button className="secondary compact" onClick={()=>{checkRepo(NEXUS_REPO,['.msi','.exe']);checkRepo(NONT_REPO,['.exe']);}}><RefreshCw size={15}/> Check all</button>}/><div className="notice"><ShieldCheck size={19}/><div><strong>Web-safe updates</strong><p>The website checks compatible GitHub Release files and opens downloads. It never launches installers itself.</p></div></div><div className="update-stack"><UpdateCard name="NONT Nexus" repo={NEXUS_REPO} current={VERSION} check={releaseChecks[NEXUS_REPO]} onCheck={()=>checkRepo(NEXUS_REPO,['.msi','.exe'])}/><UpdateCard name="NONT" repo={NONT_REPO} current="Web" check={releaseChecks[NONT_REPO]} onCheck={()=>checkRepo(NONT_REPO,['.exe'])}/></div></section>}

      {page === 'settings' && <section className="content"><Title title="Settings" subtitle="Appearance and cloud AI for the Nexus web build."/><SettingSection icon={<Sun size={18}/>} title="Appearance" subtitle="Choose the Nexus dark or bright theme."><div className="theme-grid"><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}><Moon size={19}/><strong>Dark</strong>{theme==='dark'&&<Check size={15}/>}</button><button className={theme==='bright'?'active':''} onClick={()=>setTheme('bright')}><Sun size={19}/><strong>Bright</strong>{theme==='bright'&&<Check size={15}/>}</button></div></SettingSection><SettingSection icon={<Code2 size={18}/>} title="OpenCode" subtitle="Local processes cannot run from a Vercel webpage."><div className="setting-row"><div><strong>OpenCode integration</strong><p>Available in the Windows/Tauri Nexus build.</p></div><span className="state-chip">Desktop only</span></div></SettingSection><SettingSection icon={<KeyRound size={18}/>} title="Cloud API keys" subtitle="BYOK providers for Nexus AI. Keys stay in this browser and are sent only when you make an AI request.">{providers.length>0&&<div className="provider-list">{providers.map((p)=><div className="provider-row" key={p.id}><Cloud size={17}/><div><strong>{p.name}</strong><span>{p.model}</span><small>{p.baseUrl}</small></div><span className="state-chip good">Key saved</span><button className="icon-button danger" onClick={()=>removeProvider(p.id)}><Trash2 size={15}/></button></div>)}</div>}<form className="provider-form" onSubmit={saveProvider}><label>Preset<select value={preset} onChange={(e)=>applyPreset(Number(e.target.value))}>{presets.map((p,i)=><option key={p[0]} value={i}>{p[0]}</option>)}</select></label><label>Name<input value={providerName} onChange={(e)=>setProviderName(e.target.value)}/></label><label className="wide">Base URL<input value={providerUrl} onChange={(e)=>setProviderUrl(e.target.value)}/></label><label>Model<input value={providerModel} onChange={(e)=>setProviderModel(e.target.value)} placeholder="model-name"/></label><label>API key<input type="password" value={providerKey} onChange={(e)=>setProviderKey(e.target.value)} autoComplete="off"/></label><button className="primary" type="submit"><KeyRound size={15}/> Save provider</button></form></SettingSection><SettingSection icon={<ShieldCheck size={18}/>} title="Web privacy" subtitle="This build avoids pretending the browser has desktop permissions."><div className="setting-row"><div><strong>Local app access</strong><p>Install detection, process control, tray behavior and direct EXE launch are intentionally unavailable.</p></div><span>Browser sandboxed</span></div></SettingSection></section>}
    </main>

    {showAdd && <div className="modal-backdrop" onMouseDown={()=>!addBusy&&setShowAdd(false)}><form className="modal" onSubmit={addDownload} onMouseDown={(e)=>e.stopPropagation()}><div className="modal-title"><div><small>DOWNLOAD</small><h2>Add to Nexus</h2></div><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}><X size={17}/></button></div><label>Direct URL or GitHub repository</label><input autoFocus value={directUrl} onChange={(e)=>setDirectUrl(e.target.value)} placeholder="https://github.com/owner/project"/><p>{githubRepo(directUrl)?`GitHub repository detected · ${githubRepo(directUrl)}`:'Paste a normal HTTPS file URL or a GitHub repository. Nexus Web opens the resolved file in your browser download flow.'}</p><button className="primary full" disabled={addBusy||!directUrl.trim()}>{addBusy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>} Resolve & download</button></form></div>}
  </div>;
}

function Title({ title, subtitle, action }) { return <div className="section-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action&&<div className="section-actions">{action}</div>}</div>; }
function Pulse({ icon, label, value }) { return <div className="pulse-row"><span>{icon}</span><div><strong>{label}</strong><small>{value}</small></div></div>; }
function AppCard({ app, onOpen, busy }) { const Icon=app.icon; return <article className="app-card"><div className="app-card-top"><span className="app-icon"><Icon size={27}/></span><span className="version-chip">v{VERSION}</span></div><div className="app-copy"><span className="category">{app.category}</span><h3>{app.name}</h3><strong>{app.subtitle}</strong><p>{app.description}</p></div><button className="secondary full" onClick={onOpen} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:app.kind==='builtin'?<ChevronRight size={16}/>:<PackageOpen size={16}/>} {busy?'Resolving…':app.kind==='builtin'?'Open':'Download'}</button></article>; }
function Empty({ onAdd }) { return <div className="empty"><Download size={27}/><h3>No downloads yet</h3><p>Add a direct file or GitHub repository.</p><button className="primary" onClick={onAdd}><Plus size={16}/> Add download</button></div>; }
function UpdateCard({ name, repo, current, check, onCheck }) { const asset=check?.asset; return <article className="update-card"><span className="update-icon">{name==='NONT Nexus'?<img src={LOGO} alt=""/>:<Music2 size={28}/>}</span><div><span className="category">GITHUB RELEASES</span><h3>{name}</h3><p>{repo}</p><div className="version-line"><span>Current</span><strong>{current}</strong><i>→</i><span>Status</span><strong>{check?.status==='checking'?'Checking…':asset?`v${asset.version || asset.tag}`:check?.status==='error'?'Could not check':'Not checked'}</strong></div>{asset&&<small className="asset-line"><FileArchive size={12}/> {asset.name} · {formatBytes(asset.size)}</small>}{check?.error&&<small className="error-text">{check.error}</small>}</div><div className="update-actions"><button className="secondary" onClick={onCheck} disabled={check?.status==='checking'}><RefreshCw className={check?.status==='checking'?'spin':''} size={15}/> Check</button><button className="primary" disabled={!asset} onClick={()=>asset&&startDownload(asset)}><ArrowDownToLine size={15}/> Download</button></div></article>; }
function SettingSection({ icon, title, subtitle, children }) { return <section className="settings-section"><div className="settings-heading"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div><div className="settings-body">{children}</div></section>; }
