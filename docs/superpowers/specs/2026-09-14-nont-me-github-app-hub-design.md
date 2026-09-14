# nont.me GitHub App Hub Rebuild — Design

Date: 2026-09-14
Status: Approved design, pending implementation-plan approval
Repository: `voidnont/nont.me`

## 1. Goal

Rebuild the root nont.me experience as a device-aware GitHub application discovery and download hub. The rebuild must not restore or depend on the deleted `voidnont/nont` application repository.

The root site will feature Frxe as its primary app, represented by two platform repositories:

- `voidnont/Frxe-Windows` for Windows releases.
- `voidnont/frxe` for Android/mobile releases.

The site must automatically detect the visitor's device and prefer the matching downloadable release asset. The same platform-aware behavior must apply to GitHub search results.

The rebuild should preserve unrelated subdomain functionality, including `music.nont.me`, and should replace only the root nont.me app-hub experience and the GitHub app-discovery APIs that support it.

## 2. Non-goals

- Do not recreate the deleted `voidnont/nont` repository.
- Do not expose a GitHub API token in browser code.
- Do not infer support for an operating system only from README text.
- Do not automatically download an incompatible package.
- Do not build an unrestricted GitHub crawler or persistent search index in this phase.
- Do not redesign or remove unrelated music APIs unless required to keep root-site routing correct.

## 3. Product model

### 3.1 Homepage

The root homepage becomes a compact Nont GitHub App Hub with Frxe as the featured app.

Top-level structure:

1. Nont header/brand.
2. Global GitHub app search.
3. Current-device indicator, for example `Windows · x64` or `Android · arm64` when known.
4. Large Frxe hero card with one primary device-specific action.
5. Frxe platform availability chips.
6. Recommended-for-your-device results.
7. Search results with platform filters.
8. Featured/recent Void apps when available.
9. Minimal footer with GitHub and Ko-fi links.

The layout must be responsive from the start. Phone layouts should not depend on a desktop sidebar.

### 3.2 Frxe as one logical app

Frxe is one product with multiple source repositories.

Logical app record:

```js
{
  id: 'frxe',
  name: 'Frxe',
  sources: [
    { repo: 'voidnont/Frxe-Windows', platformHint: 'windows' },
    { repo: 'voidnont/frxe', platformHint: 'android' },
  ]
}
```

The resolver merges release information from both repositories into one app detail model. The UI never forces users to understand that Windows and Android live in separate repositories unless they open source details.

Current expected behavior:

- Windows visitors should be offered the latest compatible Frxe Windows asset from `voidnont/Frxe-Windows`.
- Android visitors should be offered the latest compatible APK from `voidnont/frxe` once one exists.
- If the Android repository has no installable release yet, the Android action shows `Not available yet` rather than failing.
- Other platforms are only shown when matching downloadable assets actually exist.

## 4. Device detection

Create a client utility that returns a normalized device target:

```js
{
  os: 'windows' | 'android' | 'macos' | 'ios' | 'linux' | 'chromeos' | 'unknown',
  arch: 'x64' | 'x86' | 'arm64' | 'arm' | 'universal' | 'unknown',
  mobile: boolean,
  confidence: 'high' | 'medium' | 'low'
}
```

Detection priority:

1. `navigator.userAgentData` / Client Hints when available.
2. Platform and user-agent signals.
3. iPadOS compatibility handling where Safari may identify as macOS.
4. Unknown fallback.

Architecture is best-effort. If architecture cannot be determined reliably, the UI must not pretend to know it. The resolver should then prefer universal assets or platform-compatible assets without an architecture marker.

Users can override automatic platform selection with a platform filter or `Other downloads` control.

## 5. Release asset classification

Create a shared classifier used by the API layer and unit tests.

Each release asset becomes:

```js
{
  id,
  name,
  url,
  size,
  platform,
  arch,
  packageType,
  installable,
  score
}
```

### 5.1 Platform mapping

Windows:
- `.msi`
- `.exe`
- `.msix`
- `.appx`

Android:
- `.apk` as directly installable.
- `.aab` as Android distribution output but not a normal direct-install choice.

macOS:
- `.dmg`
- `.pkg`
- macOS-specific `.zip` archives when the filename clearly identifies macOS.

Linux:
- `.AppImage`
- `.deb`
- `.rpm`
- `.flatpak`
- `.snap`
- Linux-specific archives where platform identity is explicit.

iOS:
- `.ipa`

Unknown/source-only assets must not be presented as the recommended installer.

### 5.2 Architecture mapping

Filename markers should identify:

- `x64`, `x86_64`, `amd64`, `win64` -> x64
- `x86`, `i386`, `i686`, `ia32` -> x86
- `arm64`, `aarch64`, `armv8` -> arm64
- `armv7`, `armeabi`, `arm` -> arm
- `universal`, `universal2` -> universal

Avoid substring mistakes such as treating `x86_64` as 32-bit x86.

### 5.3 Ranking

Recommended download ranking should consider:

1. Exact OS match.
2. Exact architecture match.
3. Universal architecture fallback.
4. Installer package quality for that OS.
5. Stable release before prerelease unless the repository has no stable releases.
6. Penalize source archives, symbols, checksums, debug builds, and signatures as standalone recommendations.

The UI should still expose valid alternate downloads below the recommendation.

## 6. GitHub APIs

Replace the current fixed-repository `/api/github-sync` dependency for the new root experience with generic server-side APIs.

### 6.1 `/api/github-search`

Input:
- `q`: free-text GitHub repository search string.
- optional `platform` filter.
- optional pagination cursor/page.

Behavior:
- Search public GitHub repositories via the server.
- Never expose `GITHUB_TOKEN` to the browser.
- Return a compact repository result model.
- Debounce in the client and cache server responses briefly.
- Rank repositories with published releases and installable assets above source-only repositories.

The client should also recognize direct inputs such as `owner/repo` and GitHub repository URLs and resolve them directly instead of doing a broad search.

### 6.2 `/api/github-app`

Input:
- `repo=owner/name` or a logical app identifier for curated multi-repo apps such as Frxe.

Behavior:
- Fetch repository metadata and recent releases.
- For Frxe, merge the Windows and Android repositories.
- Return description, source URLs, latest versions, release dates, classified platform assets, and recommended assets by platform.

### 6.3 `/api/github-release`

Input:
- `repo=owner/name`.

Behavior:
- Fetch a bounded number of recent releases.
- Ignore drafts.
- Prefer stable releases, with prerelease fallback when necessary.
- Classify every asset using the shared classifier.
- Return all installable assets grouped by platform plus recommendation metadata.

### 6.4 GitHub reliability

- Use `GITHUB_TOKEN` only server-side when present.
- Send a stable User-Agent and GitHub API version header.
- Apply request timeouts.
- Return rate-limit-aware errors.
- Cache safe public responses on Vercel using short shared-cache TTLs with stale-while-revalidate.
- Do not cache explicit refresh requests.

## 7. Search experience

The current local-catalog search is replaced by server-backed GitHub app search.

Search behavior:

- Empty query: show Frxe and curated/recommended Void apps.
- Text query: search GitHub repositories.
- `owner/repo`: resolve directly.
- GitHub repository URL: normalize and resolve directly.

Platform tabs:

- Recommended
- Windows
- Android
- macOS
- Linux
- iOS

Search cards should show:

- Repository/app name.
- Owner.
- Short description.
- Latest release/version when available.
- Platform badges based on actual classified release assets.
- Primary action appropriate to the currently selected platform.
- `View downloads` for all alternatives.

A repository with no installable release assets can still appear, but it must be clearly marked `Source only` or `No installable release` and must rank below installable apps.

## 8. Download behavior

The browser should not silently download something merely because the page loaded. `Automatically detect` means automatically select the correct package and label the primary action for the current device.

A user click on the primary download button opens the direct GitHub release asset URL.

Examples:

- Windows x64 visitor + Frxe -> `Frxe-Desktop-0.1.0-x64.msi` when it is the newest compatible Windows asset.
- Android visitor + Frxe -> newest `.apk` from `voidnont/frxe` when available.
- macOS visitor + an app with `.dmg` -> latest compatible `.dmg`.
- Unknown OS -> show `Choose download` instead of guessing.

## 9. Root-site migration

The rebuild should remove obsolete root-site dependencies on the deleted Nont app repository.

Specifically, the rebuilt root experience must not contain or request:

- `voidnont/nont`
- old NontHub application cards
- old NontHub runtime/update flows
- NontHub logo URLs sourced from the deleted repository
- fixed resolver entries that require the deleted repository

Existing localStorage keys may be ignored or migrated if useful, but new root-site state should use neutral `nont.web.*` keys rather than expanding old `nonthub.*` names.

Unrelated subdomain/API behavior should remain unchanged unless a route conflict requires a small compatibility adjustment.

## 10. UI direction

Visual direction:

- Black/white base with subtle neutral depth.
- Frxe gets the strongest visual emphasis on the homepage.
- Large search input, large platform-aware primary CTA.
- Platform chips and architecture information remain compact.
- Avoid a dense desktop app-store clone; prioritize download confidence and clarity.
- Mobile-first navigation with no horizontal-scroll dependency.
- Light/dark/system appearance may be preserved if it remains simple.

Accessibility:

- Keyboard-accessible search, filters, dialogs, and download controls.
- Visible focus states.
- Meaningful labels for platform and download buttons.
- Do not use color as the only compatibility signal.

## 11. Security and abuse controls

- GitHub token remains server-side only.
- Repository identifiers must validate as `owner/repo` before GitHub API calls.
- Only `https://github.com` / GitHub API endpoints are constructed by server code.
- Do not proxy arbitrary download URLs through nont.me.
- Direct download links should use GitHub-provided `browser_download_url` values.
- Limit search query length and page size.
- Add timeouts and bounded release history requests.
- Escape/render repository metadata as React text, not injected HTML.

## 12. Testing strategy

### Unit tests

Add tests for:

1. OS detection normalization.
2. Architecture normalization.
3. Windows `.msi` / `.exe` classification.
4. Android `.apk` and `.aab` distinction.
5. macOS `.dmg` / `.pkg` classification.
6. Linux AppImage/deb/rpm classification.
7. iOS `.ipa` classification.
8. `x86_64` not being misclassified as x86.
9. Universal-asset fallback.
10. Source/debug/checksum assets not becoming the primary recommendation.
11. Stable-release preference with prerelease fallback.
12. Direct `owner/repo` parsing.
13. GitHub URL parsing.
14. Frxe dual-repository merge.
15. Frxe Windows selection from `voidnont/Frxe-Windows`.
16. Frxe Android unavailable state when `voidnont/frxe` has no APK.
17. Regression rule: rebuilt root code must not depend on `voidnont/nont`.

### API tests

Mock GitHub responses and verify:

- Search ranking.
- Rate-limit/error mapping.
- Multi-platform asset grouping.
- Frxe merged app response.
- Empty-release behavior.

### E2E tests

Use Playwright projects or mocked browser environments for:

- Windows visitor gets Windows Frxe CTA.
- Android visitor gets Android Frxe CTA or unavailable state.
- Unknown device gets `Choose download`.
- Search results filter by platform.
- App detail exposes alternate platform downloads.
- Mobile viewport is usable without horizontal scrolling.

### Build verification

Before completion:

- `npm run check`
- `npm run test:unit`
- `npm run build`
- `npm run test:e2e` or the CI-equivalent Playwright workflow

## 13. Implementation boundaries

Recommended module split:

- `src/device.js` — client device normalization.
- `shared/release-classifier.js` — platform/architecture/package classification and ranking.
- `shared/github-repo.js` — repository input parsing/validation.
- `shared/frxe-app.js` — Frxe logical multi-repo configuration.
- `api/github-search.js` — search endpoint.
- `api/github-app.js` — application/detail endpoint.
- `api/github-release.js` — generic release resolution endpoint.
- `src/App.jsx` — rebuilt page composition and state.
- `src/styles.css` — rebuilt responsive design.

Existing unrelated music files and APIs remain outside this rebuild unless root routing requires compatibility edits.

## 14. Rollout

1. Add classifier/device/parser tests first and verify they fail against the current implementation.
2. Implement shared release classification and repository parsing.
3. Implement generic GitHub release/search/app APIs.
4. Implement Frxe dual-repo aggregation.
5. Rebuild the root React UI.
6. Remove obsolete root NontHub/deleted-repository dependencies.
7. Run full unit/build/E2E verification.
8. Inspect the deployed root site on desktop and mobile.

## 15. Acceptance criteria

The rebuild is complete only when all of the following are true:

- Root nont.me no longer depends on `voidnont/nont`.
- Frxe is the main featured app.
- Frxe Windows and Android sources appear as one logical app.
- Windows visitors are directed to the best compatible Frxe Windows release.
- Android visitors are directed to the best compatible Frxe APK when one exists.
- Generic GitHub app search works for public repositories.
- Searchable apps are divided by Windows, Android, macOS, Linux, iOS, and other detected platforms based on real release assets.
- Architecture selection is best-effort and never falsely claimed when unknown.
- Users can manually choose another platform/download.
- GitHub credentials remain server-side.
- Existing unrelated music functionality is preserved.
- Unit, build, and E2E checks are green.
