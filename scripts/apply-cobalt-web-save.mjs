import fs from 'node:fs';

function replaceOrFail(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch anchor missing: ${label}`);
  return text.replace(from, to);
}

const musicPath = 'src/music/MusicApp.tsx';
let music = fs.readFileSync(musicPath, 'utf8');

music = replaceOrFail(
  music,
  "  const [saveUrl, setSaveUrl] = useState('');\n  const [saveStatus, setSaveStatus] = useState('');\n  const [saveBusy, setSaveBusy] = useState(false);",
  "  const [saveUrl, setSaveUrl] = useState('');\n  const [saveStatus, setSaveStatus] = useState('');\n  const [saveBusy, setSaveBusy] = useState(false);\n  const [saveMode, setSaveMode] = useState<'auto' | 'audio' | 'mute'>('audio');\n  const [saveAudioFormat, setSaveAudioFormat] = useState<'best' | 'mp3' | 'ogg' | 'wav' | 'opus'>('mp3');\n  const [saveVideoQuality, setSaveVideoQuality] = useState('1080');\n  const [saveItems, setSaveItems] = useState<Array<{ type: string; url: string; thumb?: string; filename?: string }>>([]);",
  'Save state',
);

const handlerStart = music.indexOf('  async function saveDirectMedia(event: FormEvent) {');
const handlerEnd = music.indexOf('\n  const ambientStyle', handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error('Save handler anchors missing');
const newHandler = `  async function saveDirectMedia(event: FormEvent) {
    event.preventDefault();
    if (saveBusy || !saveUrl.trim()) return;
    setSaveBusy(true);
    setSaveStatus('');
    setSaveItems([]);
    try {
      const response = await fetch('/api/cobalt-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: saveUrl.trim(),
          downloadMode: saveMode,
          audioFormat: saveAudioFormat,
          audioBitrate: '320',
          videoQuality: saveVideoQuality,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || \`Cobalt request failed (\${response.status}).\`);

      if (data.status === 'picker' && Array.isArray(data.items)) {
        setSaveItems(data.items);
        setSaveStatus(\`Cobalt found \${data.items.length} downloadable item\${data.items.length === 1 ? '' : 's'}.\`);
        return;
      }

      if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
        const anchor = document.createElement('a');
        anchor.href = data.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        if (data.filename) anchor.download = data.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setSaveStatus(data.filename ? \`Download ready: \${data.filename}\` : 'Download ready through Cobalt.');
        return;
      }

      throw new Error('Cobalt returned an unsupported response.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveBusy(false);
    }
  }
`;
music = music.slice(0, handlerStart) + newHandler + music.slice(handlerEnd);

const saveStart = music.indexOf("        {tab === 'save' && (");
const saveEnd = music.indexOf("        {tab === 'library' && (", saveStart);
if (saveStart < 0 || saveEnd < 0) throw new Error('Save screen anchors missing');
const newSaveScreen = `        {tab === 'save' && (
          <section className="frxe-screen">
            <header className="frxe-heading compact">
              <div><h2>Save</h2><p>Paste a supported public media link and download it through your configured Cobalt instance.</p></div>
            </header>
            <Glass className="frxe-save-card" strong>
              <div className="frxe-save-preview">
                <div className="frxe-generated-art"><Download size={28} /></div>
                <div><strong>Frxe Save · Cobalt</strong><span>Server-side Cobalt bridge · no API key exposed to the browser</span></div>
              </div>
              <form onSubmit={saveDirectMedia}>
                <label htmlFor="frxe-save-url">Media URL</label>
                <input id="frxe-save-url" value={saveUrl} onChange={(event) => setSaveUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." inputMode="url" autoComplete="off" />
                <div className="frxe-save-options">
                  <label className="frxe-save-option">
                    <span>Mode</span>
                    <select aria-label="Download mode" value={saveMode} onChange={(event) => setSaveMode(event.target.value as 'auto' | 'audio' | 'mute')}>
                      <option value="audio">Audio</option>
                      <option value="auto">Video + audio</option>
                      <option value="mute">Video only</option>
                    </select>
                  </label>
                  <label className="frxe-save-option">
                    <span>Audio format</span>
                    <select aria-label="Audio format" value={saveAudioFormat} onChange={(event) => setSaveAudioFormat(event.target.value as 'best' | 'mp3' | 'ogg' | 'wav' | 'opus')} disabled={saveMode !== 'audio'}>
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                      <option value="ogg">OGG</option>
                      <option value="opus">OPUS</option>
                      <option value="best">Best source</option>
                    </select>
                  </label>
                  <label className="frxe-save-option">
                    <span>Video quality</span>
                    <select aria-label="Video quality" value={saveVideoQuality} onChange={(event) => setSaveVideoQuality(event.target.value)} disabled={saveMode === 'audio'}>
                      <option value="max">Maximum</option>
                      <option value="2160">2160p</option>
                      <option value="1440">1440p</option>
                      <option value="1080">1080p</option>
                      <option value="720">720p</option>
                      <option value="480">480p</option>
                      <option value="360">360p</option>
                    </select>
                  </label>
                </div>
                <button className="frxe-primary wide" disabled={saveBusy || !saveUrl.trim()}>
                  {saveBusy ? <Loader2 className="frxe-spin" size={18} /> : <Download size={18} />} Download with Cobalt
                </button>
              </form>
            </Glass>
            <Glass className="frxe-save-status">
              <strong>Web Save status</strong>
              <p>{saveStatus || 'Downloads use the Cobalt instance configured on nont.me. Only save media you are allowed to download.'}</p>
            </Glass>
            {saveItems.length > 0 && (
              <Glass className="frxe-save-picker" strong>
                <strong>Choose an item</strong>
                <div className="frxe-save-picker-grid">
                  {saveItems.map((item, index) => (
                    <a key={\`${'${item.url}'}-${'${index}'}\`} href={item.url} target="_blank" rel="noreferrer" className="frxe-save-picker-item">
                      {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <div className="frxe-save-picker-icon"><Download size={20} /></div>}
                      <span>{item.filename || \`${'${item.type || \'media\'}'} ${'${index + 1}'}\`}</span>
                    </a>
                  ))}
                </div>
              </Glass>
            )}
          </section>
        )}

`;
music = music.slice(0, saveStart) + newSaveScreen + music.slice(saveEnd);
fs.writeFileSync(musicPath, music);

const cssPath = 'src/music/music.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.frxe-save-options')) {
  css += `\n.frxe-save-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.frxe-save-option{display:grid;gap:7px}.frxe-save-option>span{font-size:11px;color:var(--frxe-muted);font-weight:750}.frxe-save-option select{width:100%;min-height:48px;border:1px solid rgba(255,255,255,.14);border-radius:15px;background:#11131a;color:#fff;padding:0 12px;outline:0}.frxe-save-option select:focus{border-color:rgba(255,255,255,.34)}.frxe-save-option select:disabled{opacity:.45}.frxe-save-picker{padding:18px;margin-top:14px;max-width:880px}.frxe-save-picker>strong{display:block;margin-bottom:12px}.frxe-save-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.frxe-save-picker-item{min-width:0;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.05);padding:9px;text-decoration:none;display:grid;gap:9px;transition:transform .18s ease,border-color .18s ease}.frxe-save-picker-item:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.28)}.frxe-save-picker-item img,.frxe-save-picker-icon{width:100%;aspect-ratio:16/10;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.06)}.frxe-save-picker-icon{display:grid;place-items:center}.frxe-save-picker-item span{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:700px){.frxe-save-options{grid-template-columns:1fr}}\n`;
  fs.writeFileSync(cssPath, css);
}

const validatePath = 'scripts/validate.mjs';
let validate = fs.readFileSync(validatePath, 'utf8');
validate = replaceOrFail(
  validate,
  "const searchApi = read('api/youtube-search.js');",
  "const searchApi = read('api/youtube-search.js');\nconst cobaltApi = read('api/cobalt-download.js');\nconst cobaltShared = read('src/shared/cobalt.js');\nconst cobaltUnit = read('tests/unit/cobalt.test.mjs');",
  'validator Cobalt reads',
);
validate = replaceOrFail(
  validate,
  "expect(music.includes('Save direct media'), 'Frxe web must keep browser-safe Save');",
  "expect(music.includes('/api/cobalt-download'), 'Frxe web Save must call the server-side Cobalt bridge');\nexpect(music.includes('Download with Cobalt'), 'Frxe web Save must expose the Cobalt download action');\nexpect(cobaltApi.includes('COBALT_API_URL'), 'Cobalt bridge must use a configurable instance URL');\nexpect(cobaltApi.includes('COBALT_API_KEY'), 'Cobalt authentication must stay server-side');\nexpect(!cobaltApi.includes('api.cobalt.tools'), 'Cobalt bridge must not hard-code the protected hosted API');\nexpect(cobaltShared.includes("localProcessing: 'disabled'"), 'Frxe web must keep Cobalt local processing disabled');\nexpect(cobaltUnit.includes('Cobalt request accepts public HTTPS media URLs'), 'unit suite must cover the Cobalt request contract');",
  'validator old Save invariant',
);
validate = replaceOrFail(
  validate,
  "expect(e2e.includes('Frxe web player mirrors'), 'E2E suite must cover the Frxe web player');",
  "expect(e2e.includes('Frxe web player mirrors'), 'E2E suite must cover the Frxe web player');\nexpect(e2e.includes('FRXE Save uses the Cobalt bridge'), 'E2E suite must cover Cobalt Save');",
  'validator E2E anchor',
);
fs.writeFileSync(validatePath, validate);

const e2ePath = 'tests/e2e/nont.spec.js';
let e2e = fs.readFileSync(e2ePath, 'utf8');
if (!e2e.includes('FRXE Save uses the Cobalt bridge')) {
  e2e += `\n\ntest('FRXE Save uses the Cobalt bridge', async ({ page }) => {\n  let requestBody = null;\n  await page.route('**/api/cobalt-download', async (route) => {\n    requestBody = route.request().postDataJSON();\n    await route.fulfill({\n      status: 200,\n      contentType: 'application/json',\n      body: JSON.stringify({ status: 'picker', items: [{ type: 'video', url: 'https://media.example/item.mp4' }] }),\n    });\n  });\n\n  await page.goto('/music');\n  await page.locator('.frxe-nav').getByRole('button', { name: 'Save' }).click();\n  await expect(page.getByText('Frxe Save · Cobalt')).toBeVisible();\n  await expect(page.getByRole('combobox', { name: 'Download mode' })).toHaveValue('audio');\n  await page.getByLabel('Media URL').fill('https://www.youtube.com/watch?v=example');\n  await page.getByRole('button', { name: 'Download with Cobalt' }).click();\n\n  await expect.poll(() => requestBody).toMatchObject({\n    url: 'https://www.youtube.com/watch?v=example',\n    downloadMode: 'audio',\n    audioFormat: 'mp3',\n    videoQuality: '1080',\n  });\n  await expect(page.getByText('Choose an item')).toBeVisible();\n  await expect(page.getByRole('link', { name: /video 1/i })).toHaveAttribute('href', 'https://media.example/item.mp4');\n});\n`;
  fs.writeFileSync(e2ePath, e2e);
}

fs.rmSync('scripts/apply-cobalt-web-save.mjs', { force: true });
fs.rmSync('.github/workflows/apply-cobalt-web-save.yml', { force: true });
console.log('Applied FRXE web Cobalt Save integration.');
