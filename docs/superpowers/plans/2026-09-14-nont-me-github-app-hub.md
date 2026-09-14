# nont.me GitHub App Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild root nont.me as a device-aware GitHub app search and download hub with Frxe as one logical multi-platform app backed by `voidnont/Frxe-Windows` and `voidnont/frxe`, without restoring or depending on the deleted `voidnont/nont` repository.

**Architecture:** Move platform and release classification into pure shared modules, keep GitHub credentials and API traffic in Vercel server functions, aggregate Frxe's two repositories in a dedicated logical-app layer, then rebuild the root React UI around device-aware recommendations and server-backed GitHub search. Preserve `/music` and its existing music/Cobalt APIs while removing root-site and source-adapter assumptions about the deleted Nont app repository.

**Tech Stack:** React 19, Vite 7, Vercel serverless functions, Node 22 built-in test runner, Playwright, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-09-14-nont-me-github-app-hub-design.md`

## Global Constraints

- Do not recreate or depend on `voidnont/nont`.
- Frxe is one logical app backed by `voidnont/Frxe-Windows` for Windows and `voidnont/frxe` for Android/mobile.
- Device detection preselects a package; page load must never silently download a file.
- Platform support shown in the root app hub must come from actual GitHub release assets, not README claims.
- `GITHUB_TOKEN` stays server-side only.
- Preserve unrelated `/music`, `/api/youtube-search`, and `/api/cobalt-download` behavior.
- Root-site state uses neutral `nont.web.*` storage keys rather than adding new `nonthub.*` keys.
- Unknown OS or architecture must not be guessed; offer manual download selection instead.
- Keep Vercel security headers, Node 22 CI, unit tests, production build, and Playwright E2E checks.

---

## File Structure

### New shared/browser modules

- `shared/github-repo.js` — validate and normalize `owner/repo` and GitHub repository URLs.
- `shared/release-classifier.js` — classify release assets by OS, architecture, package type, installability, and recommendation score.
- `shared/frxe-app.js` — canonical Frxe logical-app configuration and source repositories.
- `src/device.js` — pure device-signal normalization plus browser-facing detection wrapper.

### New server modules/endpoints

- `server/github.js` — server-only GitHub request helper, timeout handling, headers, rate-limit errors, stable-release selection.
- `api/github-release.js` — generic classified release endpoint for one repository.
- `api/github-search.js` — public repository search endpoint with installable-release ranking.
- `api/github-app.js` — app-detail endpoint supporting normal repositories and the logical `frxe` app.

### Root UI files

- `src/App.jsx` — replace old NontHub desktop-app shell with the new Nont GitHub App Hub.
- `src/styles.css` — replace old root shell styling with responsive app-search/download UI.
- `src/polish.css` — retire old five-column Hub corrections; keep only root-level reduced-motion/accessibility fixes still needed.
- `src/main.jsx` — update root title/favicon/bootstrap behavior while preserving `/music` boot path.
- `index.html` — neutral Nont metadata/favicon that does not load from the deleted repository.
- `public/nont-icon.svg` — local root-site icon so branding does not depend on deleted GitHub content.

### Migration/validation files

- `scripts/adapt-sources.mjs` — stop adapting the deleted Nont app; retain only safe Frxe web-player source adaptation.
- `src/generated/source-manifest.json` — remove `voidnont/nont` entry; keep Frxe last-known source metadata only.
- `.github/workflows/adapt-sources.yml` — rename/restrict the scheduled adapter to Frxe web-player source sync.
- `scripts/validate.mjs` — replace old NontHub invariants with new app-hub invariants and deleted-repo regression checks.
- `tests/unit/github-repo.test.mjs` — parser/validation tests.
- `tests/unit/release-classifier.test.mjs` — platform, architecture, and ranking tests.
- `tests/unit/device.test.mjs` — pure device normalization tests.
- `tests/unit/github-api.test.mjs` — server helper/API behavior using injected mocked fetch.
- `tests/unit/frxe-app.test.mjs` — dual-repository aggregation/recommendation tests.
- `tests/e2e/nont.spec.js` — replace obsolete NontHub root tests; preserve existing `/music` tests.
- `README.md` — describe root app hub and server-side GitHub token usage.

---

### Task 1: Repository parsing, device detection, and release classification foundations

**Files:**
- Create: `shared/github-repo.js`
- Create: `shared/release-classifier.js`
- Create: `src/device.js`
- Create: `tests/unit/github-repo.test.mjs`
- Create: `tests/unit/release-classifier.test.mjs`
- Create: `tests/unit/device.test.mjs`

**Interfaces:**
- Produces: `normalizeGithubRepo(value) -> string | null`
- Produces: `classifyReleaseAsset(asset) -> ClassifiedAsset`
- Produces: `classifyReleaseAssets(assets) -> ClassifiedAsset[]`
- Produces: `recommendAsset(assets, target) -> ClassifiedAsset | null`
- Produces: `detectDeviceFromSignals(signals) -> DeviceTarget`
- Produces: `detectCurrentDevice() -> Promise<DeviceTarget>`

- [ ] **Step 1: Write failing repository parser tests**

Create `tests/unit/github-repo.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGithubRepo } from '../../shared/github-repo.js';

test('normalizes owner/repo and GitHub repository URLs', () => {
  assert.equal(normalizeGithubRepo('voidnont/Frxe-Windows'), 'voidnont/Frxe-Windows');
  assert.equal(normalizeGithubRepo('https://github.com/voidnont/frxe'), 'voidnont/frxe');
  assert.equal(normalizeGithubRepo('https://github.com/voidnont/frxe.git'), 'voidnont/frxe');
});

test('rejects non-GitHub and malformed repositories', () => {
  assert.equal(normalizeGithubRepo('https://example.com/voidnont/frxe'), null);
  assert.equal(normalizeGithubRepo('../bad'), null);
  assert.equal(normalizeGithubRepo('owner/repo/extra'), null);
});
```

- [ ] **Step 2: Run parser tests and verify red**

Run: `node --test tests/unit/github-repo.test.mjs`

Expected: FAIL because `shared/github-repo.js` does not exist.

- [ ] **Step 3: Implement minimal repository normalization**

Create `shared/github-repo.js` with validation equivalent to:

```js
const PART = /^[A-Za-z0-9_.-]+$/;

export function normalizeGithubRepo(value = '') {
  const input = String(value).trim();
  const direct = input.match(/^([^/]+)\/([^/]+)$/);
  if (direct && PART.test(direct[1]) && PART.test(direct[2].replace(/\.git$/i, ''))) {
    return `${direct[1]}/${direct[2].replace(/\.git$/i, '')}`;
  }
  try {
    const url = new URL(input);
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    return PART.test(owner) && PART.test(repo) ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write failing classifier tests**

Create `tests/unit/release-classifier.test.mjs` covering all required package classes and ranking:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReleaseAsset, recommendAsset } from '../../shared/release-classifier.js';

const asset = (name) => ({ id: name, name, browser_download_url: `https://github.com/example/app/releases/download/v1/${name}`, size: 100 });

test('classifies Windows, Android, macOS, Linux, and iOS packages', () => {
  assert.equal(classifyReleaseAsset(asset('App-x64.msi')).platform, 'windows');
  assert.equal(classifyReleaseAsset(asset('App-arm64.apk')).platform, 'android');
  assert.equal(classifyReleaseAsset(asset('App-universal.dmg')).platform, 'macos');
  assert.equal(classifyReleaseAsset(asset('App-x86_64.AppImage')).platform, 'linux');
  assert.equal(classifyReleaseAsset(asset('App.ipa')).platform, 'ios');
});

test('keeps AAB non-direct-install and never misclassifies x86_64 as x86', () => {
  const aab = classifyReleaseAsset(asset('App-arm64.aab'));
  assert.equal(aab.platform, 'android');
  assert.equal(aab.installable, false);
  assert.equal(classifyReleaseAsset(asset('App-x86_64.msi')).arch, 'x64');
});

test('recommends exact arch, then universal, and penalizes source/debug assets', () => {
  const assets = [
    asset('App-source.zip'),
    asset('App-debug-x64.exe'),
    asset('App-universal.msi'),
    asset('App-x64.msi'),
  ].map(classifyReleaseAsset);
  assert.equal(recommendAsset(assets, { os: 'windows', arch: 'x64' })?.name, 'App-x64.msi');
  assert.equal(recommendAsset(assets, { os: 'windows', arch: 'arm64' })?.name, 'App-universal.msi');
});
```

- [ ] **Step 5: Run classifier tests and verify red**

Run: `node --test tests/unit/release-classifier.test.mjs`

Expected: FAIL because classifier exports do not exist.

- [ ] **Step 6: Implement classification and recommendation**

Create `shared/release-classifier.js` with:

```js
export const PLATFORMS = ['windows', 'android', 'macos', 'linux', 'ios'];

export function classifyReleaseAsset(asset) {
  // Normalize filename once.
  // Determine packageType from final extension.
  // Map platform only when the extension/name proves the platform.
  // Map x86_64 before x86 so substring matching cannot downgrade it.
  // Mark .aab, source archives, checksum/signature/debug/symbol artifacts as non-primary.
  // Return { id, name, url, size, platform, arch, packageType, installable, score }.
}

export function classifyReleaseAssets(assets = []) {
  return assets.map(classifyReleaseAsset);
}

export function recommendAsset(assets, target) {
  return assets
    .filter((item) => item.installable && item.platform === target.os)
    .map((item) => ({ item, rank: item.score + (item.arch === target.arch ? 100 : item.arch === 'universal' ? 50 : target.arch === 'unknown' && item.arch === 'unknown' ? 30 : 0) }))
    .filter(({ item }) => target.arch === 'unknown' || item.arch === target.arch || item.arch === 'universal' || item.arch === 'unknown')
    .sort((a, b) => b.rank - a.rank)[0]?.item || null;
}
```

Use explicit extension/name rules from the approved spec; source `.zip` files must remain `platform: 'unknown'` unless their filename explicitly contains a platform marker such as `macos`, `darwin`, or `linux`.

- [ ] **Step 7: Write failing pure device tests**

Create `tests/unit/device.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDeviceFromSignals } from '../../src/device.js';

test('normalizes Windows and Android signals', () => {
  assert.deepEqual(
    detectDeviceFromSignals({ platform: 'Windows', architecture: 'x86', bitness: '64', mobile: false, userAgent: '' }),
    { os: 'windows', arch: 'x64', mobile: false, confidence: 'high' },
  );
  assert.equal(detectDeviceFromSignals({ platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android' }).os, 'android');
});

test('does not invent architecture when unavailable', () => {
  assert.equal(detectDeviceFromSignals({ platform: 'Linux', userAgent: 'Linux' }).arch, 'unknown');
});
```

- [ ] **Step 8: Implement device normalization and browser wrapper**

`src/device.js` should export a pure `detectDeviceFromSignals` for tests and an async wrapper that reads `navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'platform'])` when available, then falls back to `navigator.platform`/`navigator.userAgent`. Include the iPadOS desktop-UA check (`MacIntel` + touch points) and return `confidence: 'low'` for unknown targets.

- [ ] **Step 9: Run all new foundation tests**

Run: `node --test tests/unit/github-repo.test.mjs tests/unit/release-classifier.test.mjs tests/unit/device.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add shared/github-repo.js shared/release-classifier.js src/device.js tests/unit/github-repo.test.mjs tests/unit/release-classifier.test.mjs tests/unit/device.test.mjs
git commit -m "feat: add device and release classification"
```

---

### Task 2: Server-side GitHub client and generic release endpoint

**Files:**
- Create: `server/github.js`
- Create: `api/github-release.js`
- Create: `tests/unit/github-api.test.mjs`

**Interfaces:**
- Consumes: `normalizeGithubRepo`, `classifyReleaseAssets`, `recommendAsset`
- Produces: `githubRequest(path, options) -> Promise<any>`
- Produces: `selectPublishedRelease(releases) -> release | null`
- Produces: `loadRepositoryRelease(repo, fetchImpl?) -> Promise<ReleaseSummary>`
- Endpoint: `GET /api/github-release?repo=owner/name`

- [ ] **Step 1: Write failing server helper tests**

In `tests/unit/github-api.test.mjs`, use a fake fetch function; never call live GitHub:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPublishedRelease, loadRepositoryRelease } from '../../server/github.js';

test('stable release wins over prerelease and drafts are ignored', () => {
  const selected = selectPublishedRelease([
    { draft: true, prerelease: false, tag_name: 'v3' },
    { draft: false, prerelease: true, tag_name: 'v2-beta' },
    { draft: false, prerelease: false, tag_name: 'v1' },
  ]);
  assert.equal(selected.tag_name, 'v1');
});

test('release loader classifies assets and returns recommendations', async () => {
  const fakeFetch = async () => new Response(JSON.stringify([
    { draft: false, prerelease: false, tag_name: 'v1.2.3', html_url: 'https://github.com/o/r/releases/tag/v1.2.3', published_at: '2026-09-14T00:00:00Z', assets: [
      { id: 1, name: 'App-x64.msi', size: 10, browser_download_url: 'https://github.com/o/r/releases/download/v1.2.3/App-x64.msi' },
      { id: 2, name: 'App-arm64.apk', size: 11, browser_download_url: 'https://github.com/o/r/releases/download/v1.2.3/App-arm64.apk' },
    ] },
  ]), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await loadRepositoryRelease('o/r', fakeFetch);
  assert.equal(result.version, '1.2.3');
  assert.equal(result.platforms.windows.length, 1);
  assert.equal(result.platforms.android.length, 1);
});
```

- [ ] **Step 2: Run API unit test and verify red**

Run: `node --test tests/unit/github-api.test.mjs`

Expected: FAIL because `server/github.js` does not exist.

- [ ] **Step 3: Implement `server/github.js`**

Required behavior:

```js
const REQUEST_TIMEOUT_MS = 8000;

export function selectPublishedRelease(releases = []) {
  const published = releases.filter((release) => !release.draft);
  return published.find((release) => !release.prerelease) || published[0] || null;
}

export async function loadRepositoryRelease(repo, fetchImpl = fetch) {
  // validate repo
  // GET /repos/{repo}/releases?per_page=10
  // select stable/prerelease fallback
  // classify selected release assets
  // return { repo, version, prerelease, publishedAt, releaseUrl, assets, platforms, recommendations }
}
```

`githubRequest` must set:

```js
{
  Accept: 'application/vnd.github+json',
  'User-Agent': 'nont.me-github-app-hub',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}
```

Use `AbortController` and throw a distinct error message when `x-ratelimit-remaining` is `0`.

- [ ] **Step 4: Implement `api/github-release.js`**

Rules:

- GET only; otherwise 405 with `Allow: GET`.
- Validate `req.query.repo` using `normalizeGithubRepo`.
- 400 for malformed repo.
- 200 with `loadRepositoryRelease()` output.
- 502 for GitHub failure with a compact non-secret error.
- `Cache-Control: s-maxage=120, stale-while-revalidate=600` for successful public responses.
- Never return `process.env.GITHUB_TOKEN` or request headers.

- [ ] **Step 5: Run API tests**

Run: `node --test tests/unit/github-api.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/github.js api/github-release.js tests/unit/github-api.test.mjs
git commit -m "feat: add generic GitHub release resolver"
```

---

### Task 3: Frxe multi-repository app model

**Files:**
- Create: `shared/frxe-app.js`
- Create: `tests/unit/frxe-app.test.mjs`
- Modify: `server/github.js`

**Interfaces:**
- Produces: `FRXE_APP`
- Produces: `mergeFrxeSources(sourceSummaries, target?) -> AppSummary`
- Consumes: `loadRepositoryRelease(repo, fetchImpl)` from Task 2

- [ ] **Step 1: Write failing Frxe aggregation tests**

Create `tests/unit/frxe-app.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRXE_APP, mergeFrxeSources } from '../../shared/frxe-app.js';

test('Frxe has the Windows and Android repositories only', () => {
  assert.deepEqual(FRXE_APP.sources.map((item) => item.repo), ['voidnont/Frxe-Windows', 'voidnont/frxe']);
});

test('Windows recommendation comes from Frxe-Windows and Android can be unavailable', () => {
  const merged = mergeFrxeSources([
    { repo: 'voidnont/Frxe-Windows', version: '0.1.0', assets: [{ name: 'Frxe-Desktop-0.1.0-x64.msi', platform: 'windows', arch: 'x64', installable: true, score: 10, url: 'https://github.com/voidnont/Frxe-Windows/releases/download/v0.1.0/a.msi' }] },
    { repo: 'voidnont/frxe', version: '', assets: [] },
  ], { os: 'windows', arch: 'x64' });
  assert.equal(merged.recommended.repo, 'voidnont/Frxe-Windows');
  assert.equal(merged.availablePlatforms.includes('android'), false);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test tests/unit/frxe-app.test.mjs`

Expected: FAIL because `shared/frxe-app.js` is missing.

- [ ] **Step 3: Implement canonical Frxe config and merge**

Create `shared/frxe-app.js`:

```js
import { recommendAsset } from './release-classifier.js';

export const FRXE_APP = {
  id: 'frxe',
  name: 'Frxe',
  sources: [
    { repo: 'voidnont/Frxe-Windows', platformHint: 'windows' },
    { repo: 'voidnont/frxe', platformHint: 'android' },
  ],
};

export function mergeFrxeSources(sourceSummaries, target = { os: 'unknown', arch: 'unknown' }) {
  const taggedAssets = sourceSummaries.flatMap((source) => (source.assets || []).map((asset) => ({ ...asset, repo: source.repo })));
  const recommended = target.os === 'unknown' ? null : recommendAsset(taggedAssets, target);
  return {
    id: FRXE_APP.id,
    name: FRXE_APP.name,
    sources: sourceSummaries,
    assets: taggedAssets,
    availablePlatforms: [...new Set(taggedAssets.filter((asset) => asset.installable && asset.platform !== 'unknown').map((asset) => asset.platform))],
    recommended,
  };
}
```

Ensure `recommendAsset` preserves extra asset properties such as `repo` rather than rebuilding objects.

- [ ] **Step 4: Run Frxe and classifier tests**

Run: `node --test tests/unit/frxe-app.test.mjs tests/unit/release-classifier.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/frxe-app.js tests/unit/frxe-app.test.mjs shared/release-classifier.js
git commit -m "feat: model Frxe as a multi-platform app"
```

---

### Task 4: Generic GitHub search and app-detail APIs

**Files:**
- Create: `api/github-search.js`
- Create: `api/github-app.js`
- Modify: `server/github.js`
- Modify: `tests/unit/github-api.test.mjs`

**Interfaces:**
- Endpoint: `GET /api/github-search?q=<query>&platform=<optional>`
- Endpoint: `GET /api/github-app?app=frxe`
- Endpoint: `GET /api/github-app?repo=owner/name`
- Produces: `searchRepositories(query, options, fetchImpl?)`
- Produces: `loadRepositoryApp(repo, fetchImpl?)`
- Produces: `loadFrxeApp(fetchImpl?)`

- [ ] **Step 1: Add failing search/detail unit tests with mocked GitHub**

Extend `tests/unit/github-api.test.mjs` with tests asserting:

```js
// search query is trimmed and capped at 80 chars
// page size is capped at 8 repositories
// repositories with installable assets rank above source-only repositories
// direct repository detail includes description + classified release data
// app=frxe requests both canonical Frxe repositories and merges them
// GitHub 403 + x-ratelimit-remaining=0 maps to a rate-limit-aware error
```

Use an injected `fetchImpl` that switches on request URL and returns deterministic `Response` objects.

- [ ] **Step 2: Verify red**

Run: `node --test tests/unit/github-api.test.mjs`

Expected: FAIL for missing search/app helpers.

- [ ] **Step 3: Implement search helper in `server/github.js`**

Behavior:

```js
export async function searchRepositories(query, { platform = '', page = 1 } = {}, fetchImpl = fetch) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return { items: [], page: 1, hasMore: false };
  // GET /search/repositories?q=...&sort=stars&order=desc&per_page=8&page=...
  // For each result, fetch bounded release summary with Promise.allSettled.
  // Return repo metadata + availablePlatforms + latestVersion + primary asset for requested platform.
  // Source-only results remain but sort below installable apps.
}
```

Keep concurrency bounded to the eight search results returned; do not crawl beyond requested results.

- [ ] **Step 4: Implement `api/github-search.js`**

Validate:

- `q` required and max 80 chars.
- `platform` must be one of `windows|android|macos|linux|ios|recommended` when present.
- `page` integer from 1 to 10.

Return short shared-cache headers (`s-maxage=60, stale-while-revalidate=300`).

- [ ] **Step 5: Implement repository and Frxe app detail helpers**

`loadRepositoryApp` should fetch `/repos/{repo}` metadata and `loadRepositoryRelease(repo)` in parallel.

`loadFrxeApp` should fetch metadata/release summary for both `FRXE_APP.sources`, tolerate one source having no releases or a 404, and pass both summaries to `mergeFrxeSources`.

- [ ] **Step 6: Implement `api/github-app.js`**

Rules:

- `?app=frxe` resolves the logical multi-repo Frxe app.
- `?repo=owner/name` resolves one public repo.
- Supplying both or neither returns 400.
- GET only.
- Cache successful public responses for 120 seconds with stale-while-revalidate.

- [ ] **Step 7: Run API unit suite**

Run: `node --test tests/unit/github-api.test.mjs tests/unit/frxe-app.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/github-search.js api/github-app.js server/github.js tests/unit/github-api.test.mjs
git commit -m "feat: add GitHub app search APIs"
```

---

### Task 5: Remove deleted Nont repository from adaptation and validation infrastructure

**Files:**
- Modify: `scripts/adapt-sources.mjs`
- Modify: `src/generated/source-manifest.json`
- Modify: `.github/workflows/adapt-sources.yml`
- Modify: `scripts/validate.mjs`
- Modify: `tests/unit/source-contract.test.mjs`
- Optionally modify: `shared/source-contract.js` only to remove dead Nont-specific contract branches if no remaining `/music` code uses them

**Interfaces:**
- Source adapter continues to update only `src/music/MusicApp.tsx` from Frxe source metadata when available.
- Root app must not be patched by scheduled source adaptation.

- [ ] **Step 1: Change validation first so current tree fails for the right reason**

Replace old assertions that require `voidnont/nont`, old NontHub navigation, old sync API, old Nont favicon, and old five-column sidebar with new hard regressions:

```js
const forbiddenDeletedRepo = 'voidnont/nont';
for (const [label, text] of [
  ['root app', app],
  ['root bootstrap', main],
  ['source adapter', sourceAdapter],
  ['source manifest', JSON.stringify(sourceManifest)],
  ['root browser tests', e2e],
]) {
  expect(!text.toLowerCase().includes(forbiddenDeletedRepo), `${label} must not depend on deleted voidnont/nont`);
}

expect(app.includes("app: 'frxe'" ) || app.includes("'/api/github-app?app=frxe'"), 'root must load logical Frxe app');
expect(fs.existsSync('shared/release-classifier.js'), 'release classifier must exist');
expect(fs.existsSync('api/github-search.js'), 'GitHub search API must exist');
expect(fs.existsSync('api/github-app.js'), 'GitHub app API must exist');
expect(fs.existsSync('api/github-release.js'), 'GitHub release API must exist');
```

Retain all music/Cobalt invariants that are unrelated to the old root Hub.

- [ ] **Step 2: Run `npm run check` and verify red**

Expected: FAIL because the old root/adaptation files still reference `voidnont/nont`.

- [ ] **Step 3: Restrict `scripts/adapt-sources.mjs` to Frxe web-player adaptation**

Remove the Nont source object and `patchNontWeb` / `patchFrxeApp` root-card patching. Keep only:

```js
const SOURCES = [{
  repo: 'voidnont/frxe',
  kind: 'frxe',
  versionPath: 'app/build.gradle.kts',
  appSourcePaths: [
    'app/src/main/java/com/frxe/music/ui/FrxeApp.kt',
    'app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt',
    'app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt',
  ],
}];
```

If the recreated Frxe repo is empty, preserve the previous Frxe manifest entry and do not modify `MusicApp.tsx`; the scheduled adapter must exit successfully with a warning.

- [ ] **Step 4: Rewrite generated manifest**

`src/generated/source-manifest.json` must contain no `voidnont/nont` key. Keep only the last-known Frxe metadata needed by `/music`, or `{}` if no safe prior Frxe entry exists.

- [ ] **Step 5: Update scheduled adapter workflow**

Change workflow/job copy to Frxe-only and limit committed paths:

```yaml
- name: Adapt FRXE web player source metadata
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: node scripts/adapt-sources.mjs

- name: Commit source adaptation when changed
  run: |
    if [ -z "$(git status --porcelain -- src/music/MusicApp.tsx src/generated/source-manifest.json)" ]; then
      echo "FRXE web source metadata is already synchronized."
      exit 0
    fi
    # configure bot
    git add src/music/MusicApp.tsx src/generated/source-manifest.json
    git commit -m "chore: adapt FRXE web source metadata"
    git push
```

- [ ] **Step 6: Update source-contract tests**

Remove tests whose only purpose is the deleted Nont app contract. Keep Frxe capability tests used by music source adaptation.

- [ ] **Step 7: Do not require `npm run check` to pass yet**

At this checkpoint, the old `src/App.jsx` and E2E tests are expected to keep the deleted-repo regression red. Run the focused adapter/source tests instead:

Run: `node --test tests/unit/source-contract.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/adapt-sources.mjs src/generated/source-manifest.json .github/workflows/adapt-sources.yml scripts/validate.mjs tests/unit/source-contract.test.mjs shared/source-contract.js
git commit -m "refactor: remove deleted Nont source dependency"
```

---

### Task 6: Rebuild the root React application and responsive design

**Files:**
- Replace: `src/App.jsx`
- Replace: `src/styles.css`
- Modify: `src/polish.css`
- Modify: `src/main.jsx`
- Modify: `index.html`
- Create: `public/nont-icon.svg`

**Interfaces:**
- Consumes: `detectCurrentDevice()`
- Consumes: `GET /api/github-app?app=frxe`
- Consumes: `GET /api/github-search?q=...&platform=...`
- Root route only; `/music` bootstrap remains in `src/main.jsx`.

- [ ] **Step 1: Add a local root favicon before removing remote deleted-repo icon URLs**

Create `public/nont-icon.svg` as a simple local black/white Nont mark with a `viewBox="0 0 64 64"`; keep it self-contained with no external references.

- [ ] **Step 2: Replace root metadata/bootstrap references**

In `index.html`:

```html
<title>Nont</title>
<link rel="icon" href="/nont-icon.svg" />
```

In `src/main.jsx`, preserve the `/music` branch exactly enough that it still lazy-loads `MusicApp.tsx` and sets `document.title = 'FRXE'`. Root branch should set `document.title = 'Nont'`, use `/nont-icon.svg`, and import the rebuilt root CSS.

- [ ] **Step 3: Replace `src/App.jsx` with the new state model**

Required root state:

```js
const [device, setDevice] = useState({ os: 'unknown', arch: 'unknown', mobile: false, confidence: 'low' });
const [frxe, setFrxe] = useState(null);
const [query, setQuery] = useState('');
const [results, setResults] = useState([]);
const [platform, setPlatform] = useState('recommended');
const [selectedApp, setSelectedApp] = useState(null);
const [loading, setLoading] = useState({ frxe: true, search: false, detail: false });
const [error, setError] = useState('');
```

On mount:

```js
useEffect(() => {
  void detectCurrentDevice().then(setDevice);
  void fetch('/api/github-app?app=frxe', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load Frxe')))
    .then(setFrxe)
    .catch((reason) => setError(String(reason)))
    .finally(() => setLoading((state) => ({ ...state, frxe: false })));
}, []);
```

Do not call `window.open` or assign `location` from this effect.

- [ ] **Step 4: Implement device-aware Frxe CTA**

Behavior:

- Windows + compatible recommendation -> `Download Frxe for Windows`.
- Android + compatible APK -> `Download Frxe for Android`.
- Android with no APK -> disabled `Android build not available yet` and show Windows under other downloads.
- Unknown OS -> `Choose download` opens downloads panel; no auto download.
- CTA click uses the GitHub asset `url` only after user interaction.

- [ ] **Step 5: Implement debounced GitHub search**

Use a 300 ms debounce and `AbortController`:

```js
useEffect(() => {
  const trimmed = query.trim();
  if (!trimmed) { setResults([]); return undefined; }
  const controller = new AbortController();
  const timer = window.setTimeout(async () => {
    setLoading((state) => ({ ...state, search: true }));
    try {
      const params = new URLSearchParams({ q: trimmed });
      if (platform !== 'recommended') params.set('platform', platform);
      const response = await fetch(`/api/github-search?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');
      setResults(data.items || []);
    } catch (reason) {
      if (reason?.name !== 'AbortError') setError(String(reason));
    } finally {
      setLoading((state) => ({ ...state, search: false }));
    }
  }, 300);
  return () => { window.clearTimeout(timer); controller.abort(); };
}, [query, platform]);
```

If `normalizeGithubRepo(query)` succeeds, resolve the direct repository through `/api/github-app?repo=...` instead of broad search.

- [ ] **Step 6: Build root component structure**

Use semantic sections/classes:

```text
.app-shell
  header.site-header
    brand
    device-pill
    GitHub / Ko-fi links
  main
    section.hero-frxe
      Frxe identity
      device recommendation
      primary CTA
      platform chips
    section.search-section
      search input
      platform tabs: Recommended / Windows / Android / macOS / Linux / iOS
      result cards
    app-download dialog/drawer for alternate assets
  footer
```

Do not recreate the old Home/Library/Downloads/Installer/Settings sidebar.

- [ ] **Step 7: Replace root CSS mobile-first**

`src/styles.css` must include:

- black/white neutral design tokens;
- responsive container width;
- hero and card grids that collapse to one column under 720px;
- horizontally scrollable platform chip row only when necessary, with page itself staying `overflow-x: hidden`;
- focus-visible outlines;
- download drawer/dialog mobile sizing;
- disabled/unavailable states not communicated by color alone;
- `prefers-reduced-motion` fallback.

`src/polish.css` must remove the old `repeat(5` mobile navigation assumption and only retain corrections that still apply to the rebuilt root.

- [ ] **Step 8: Build locally**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 9: Run validation to expose only remaining test/invariant migration work**

Run: `npm run check`

Expected at this stage: either PASS or failures only for old E2E test-content assertions that Task 7 replaces. No failure may mention a live `voidnont/nont` dependency in production root files.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx src/styles.css src/polish.css src/main.jsx index.html public/nont-icon.svg
git commit -m "feat: rebuild nont.me as GitHub app hub"
```

---

### Task 7: Replace obsolete root E2E coverage while preserving FRXE web-player coverage

**Files:**
- Replace root-test portion of: `tests/e2e/nont.spec.js`
- Modify: `scripts/validate.mjs`

**Interfaces:**
- Mock: `/api/github-app?app=frxe`
- Mock: `/api/github-search?*`
- Preserve mocks/tests for `/api/youtube-search` and `/api/cobalt-download`

- [ ] **Step 1: Replace old Hub fixtures**

Delete `NONT_ICON`, `repoPayload`, and `mockHubApis` fixtures tied to `github-sync`/NontHub.

Add deterministic fixtures:

```js
const FRXE_APP = {
  id: 'frxe',
  name: 'Frxe',
  availablePlatforms: ['windows'],
  assets: [{
    id: 1,
    repo: 'voidnont/Frxe-Windows',
    name: 'Frxe-Desktop-0.1.0-x64.msi',
    url: 'https://github.com/voidnont/Frxe-Windows/releases/download/v0.1.0/Frxe-Desktop-0.1.0-x64.msi',
    platform: 'windows',
    arch: 'x64',
    packageType: 'msi',
    installable: true,
  }],
};
```

`mockAppHubApis(page)` must fulfill Frxe app and search requests without network access.

- [ ] **Step 2: Add Windows CTA E2E test**

Set Chromium user agent/platform initialization so root detects Windows, then assert:

```js
await expect(page).toHaveTitle('Nont');
await expect(page.getByRole('heading', { name: 'Frxe' })).toBeVisible();
await expect(page.getByRole('button', { name: /Download Frxe for Windows/i })).toBeVisible();
```

Intercept the button click or inspect its action so the direct URL points to the mocked MSI; assert no download/navigation occurred before the click.

- [ ] **Step 3: Add Android unavailable/available tests**

One fixture has only Windows and expects `Android build not available yet`.

A second fixture adds:

```js
{
  repo: 'voidnont/frxe',
  name: 'frxe-arm64.apk',
  url: 'https://github.com/voidnont/frxe/releases/download/v1/frxe-arm64.apk',
  platform: 'android',
  arch: 'arm64',
  packageType: 'apk',
  installable: true,
}
```

and expects `Download Frxe for Android`.

- [ ] **Step 4: Add unknown-device test**

Mock/initialize ambiguous signals and assert the hero primary control says `Choose download` rather than claiming a platform.

- [ ] **Step 5: Add search/filter tests**

Search `browser`, mock two results with Windows/Linux vs Android assets, click `Android`, and assert only/primarily Android-compatible result cards remain according to the API response. Also test direct `owner/repo` input invokes `/api/github-app?repo=...` rather than `/api/github-search`.

- [ ] **Step 6: Add mobile overflow/accessibility test**

At 390x844:

```js
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
await expect(page.getByRole('textbox', { name: /Search GitHub apps/i })).toBeVisible();
await expect(page.getByRole('button', { name: /Download|Choose download/i })).toBeVisible();
```

- [ ] **Step 7: Preserve the two existing `/music` E2E tests**

Keep `Frxe web player mirrors the five-tab app shell and music ranking` and `FRXE Save uses the Cobalt bridge` behavior intact, changing only source-link text if the recreated Frxe repo casing changes.

- [ ] **Step 8: Update validation assertions to match new E2E names**

Require strings such as:

```js
expect(e2e.includes('Windows visitor gets Frxe Windows download'), 'E2E must cover Windows device routing');
expect(e2e.includes('Android visitor handles Frxe APK availability'), 'E2E must cover Android routing');
expect(e2e.includes('unknown device chooses a download manually'), 'E2E must cover unknown-device fallback');
expect(e2e.includes('GitHub app search filters by platform'), 'E2E must cover platform search');
expect(e2e.includes('mobile app hub has no horizontal overflow'), 'E2E must cover mobile layout');
```

Remove every old validation requirement for Installer, Library, manual Nont/Veil sync, NontHub favicon, and five-destination sidebar.

- [ ] **Step 9: Run browser tests**

Run: `npm run test:e2e`

Expected: PASS for rebuilt root and preserved `/music` tests.

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/nont.spec.js scripts/validate.mjs
git commit -m "test: cover device-aware GitHub app hub"
```

---

### Task 8: Documentation, CI wording, and full verification

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` only for step names if needed; keep the same required commands
- Modify: `package.json` only if neutral script descriptions/names are necessary; do not remove `test:unit`, `build`, `test:e2e`, or `test:e2e:ci`
- Modify: `vercel.json` only if new API routes need explicit compatibility; retain security headers and `npm run check && npm run build`

**Interfaces:**
- No new runtime interfaces.
- Completion gate is the full existing CI command set plus deleted-repo search.

- [ ] **Step 1: Update README**

Document:

```text
nont.me is a device-aware GitHub app discovery/download hub.
Featured app: Frxe.
Frxe sources: voidnont/Frxe-Windows and voidnont/frxe.
Optional server environment: GITHUB_TOKEN for higher GitHub API rate limits.
The token is never sent to browser code.
/music remains the FRXE web player.
```

Remove instructions implying the root site mirrors or installs `voidnont/nont`.

- [ ] **Step 2: Neutralize CI step wording without weakening CI**

Keep commands exactly:

```yaml
- run: npm run check
- run: npm run test:unit
- run: npm run build
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e:ci
```

A step named `Unit test app hub and shared logic` is preferable to `Unit test shared music logic` because unit coverage now includes both.

- [ ] **Step 3: Run static deleted-repository regression search**

Run:

```bash
node -e "const fs=require('fs'),p=['src','api','server','shared','scripts','tests','index.html','README.md'];function walk(x){if(!fs.existsSync(x))return[];const s=fs.statSync(x);if(s.isDirectory())return fs.readdirSync(x).flatMap(n=>walk(x+'/'+n));return[x]}const bad=p.flatMap(walk).filter(f=>/\.(js|jsx|mjs|ts|tsx|json|html|md)$/.test(f)).filter(f=>fs.readFileSync(f,'utf8').toLowerCase().includes('voidnont/nont'));if(bad.length){console.error(bad.join('\n'));process.exit(1)}" 
```

Expected: no output, exit 0. If the design/plan docs intentionally mention the deleted repo, exclude `docs/` as the command does above.

- [ ] **Step 4: Run project validation**

Run: `npm run check`

Expected: `Validation passed for nont.me v<package version>.`

- [ ] **Step 5: Run complete unit suite**

Run: `npm run test:unit`

Expected: PASS, including existing Cobalt/music tests plus new repository/device/release/API/Frxe tests.

- [ ] **Step 6: Run production build**

Run: `npm run build`

Expected: PASS with Vite production output.

- [ ] **Step 7: Run complete Playwright suite**

Run: `npm run test:e2e`

Expected: PASS for rebuilt root and `/music`.

- [ ] **Step 8: Inspect production security/deployment config**

Verify `vercel.json` still contains:

- build command containing `npm run check && npm run build`;
- `Content-Security-Policy`;
- `X-Content-Type-Options`;
- rewrites that keep root SPA and `/music` working without swallowing `/api/*`.

- [ ] **Step 9: Commit final documentation/CI cleanup**

```bash
git add README.md .github/workflows/ci.yml package.json vercel.json
git commit -m "docs: document rebuilt nont.me app hub"
```

- [ ] **Step 10: Final branch verification**

Run all completion commands again from a clean working tree:

```bash
npm run check
npm run test:unit
npm run build
npm run test:e2e
```

Then inspect `git status --short`; expected output is empty.

---

## Plan Self-Review

### Spec coverage

- Root no longer depends on deleted `voidnont/nont`: Tasks 5, 6, 7, 8.
- Frxe primary app with Windows + Android repositories: Tasks 3, 4, 6.
- Device/architecture detection and unknown fallback: Tasks 1, 6, 7.
- Windows/Android/macOS/Linux/iOS classification from real assets: Tasks 1, 2.
- Generic GitHub search and direct repo resolution: Tasks 4, 6, 7.
- Manual alternate download selection: Task 6.
- Server-only GitHub token and rate-limit handling: Tasks 2, 4.
- Preserve `/music` and Cobalt/search APIs: Tasks 5, 6, 7, 8.
- Mobile-first accessible root UI: Tasks 6, 7.
- Unit/build/E2E verification: Tasks 1-8, final gate in Task 8.

### Placeholder scan

No `TBD`, `TODO`, `implement later`, or unspecified test steps are present. Each implementation task defines exact files, exported interfaces, test commands, and expected results.

### Type/interface consistency

- `DeviceTarget`: `{ os, arch, mobile, confidence }` is used consistently by classifier recommendation, Frxe aggregation, root UI, and E2E expectations.
- Classified assets consistently use `{ id, name, url, size, platform, arch, packageType, installable, score }`, with optional `repo` added during aggregation.
- Repository parsing always returns canonical `owner/repo` or `null`.
- Frxe logical app consistently uses `id: 'frxe'` and the two canonical source repositories.
