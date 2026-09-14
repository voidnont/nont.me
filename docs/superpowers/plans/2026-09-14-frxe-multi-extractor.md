# FRXE Multi-Extractor Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-browser Cobalt credentials and an InnerTube → yt-dlp → Cobalt Save pipeline to FRXE Web, surfacing login/CAPTCHA/consent/age/DRM challenges without bypassing them.

**Architecture:** nont.me remains on Vercel. A Python extractor worker under `extractor-worker/` runs separately and only receives extraction requests plus a worker bearer token. The browser's Cobalt key is encrypted into an `HttpOnly` cookie by nont.me and is only decrypted by the Cobalt fallback API; it is never sent to the worker or exposed to page JavaScript.

**Tech Stack:** React 19 + Vite, Vercel serverless Node APIs, Node built-in crypto, Python 3.11+, FastAPI, yt-dlp, Playwright, Node test runner, Python unittest.

**Spec:** `docs/superpowers/specs/2026-09-14-frxe-multi-extractor-design.md`

## Global Constraints

- Modify only `voidnont/nont.me`; do not modify `voidnont/Frxe`.
- Do not modify `README.md`.
- Extraction order is InnerTube first, yt-dlp second, Cobalt fallback third.
- NewPipe Extractor is not used.
- Login, CAPTCHA, consent, age verification, and DRM results are displayed to the user; none are bypassed or automated.
- Do not collect/import provider credentials or session cookies.
- The Cobalt key is browser-specific, encrypted, `HttpOnly`, `Secure`, `SameSite=Lax`, and never readable by frontend JavaScript.
- The Cobalt key must never be sent to the extractor worker.
- Worker target URL validation must reject private, loopback, link-local, and non-HTTP(S) targets.

---

### Task 1: Per-browser Cobalt key cookie vault

**Files:**
- Create: `src/server/cobaltKeyCookie.js`
- Create: `api/cobalt-key.js`
- Modify: `api/cobalt-download.js`
- Test: `tests/unit/cobaltKeyCookie.test.mjs`

**Interfaces:**
- Produces `encryptCobaltKey(key, secret) -> cookieValue`, `decryptCobaltKey(cookieValue, secret) -> key|null`, `parseCookies(header) -> object`, and `cobaltCookieHeader(value, options) -> string`.
- `GET /api/cobalt-key` returns `{ configured: boolean }` only.
- `POST /api/cobalt-key` accepts `{ key: string }`, encrypts it with `COBALT_COOKIE_SECRET`, and sets `frxe_cobalt_key`.
- `DELETE /api/cobalt-key` clears `frxe_cobalt_key`.
- `api/cobalt-download.js` consumes the decrypted cookie key and no longer uses a global `COBALT_API_KEY`.

- [ ] **Step 1: Write failing cookie-vault unit tests**

Create tests that assert round-trip AES-GCM encryption, wrong-secret failure, no plaintext key in the cookie value, cookie parsing, and required flags in the Set-Cookie string.

- [ ] **Step 2: Run the branch unit suite and verify RED**

Run through CI: `npm run test:unit`. Expected failure: module `src/server/cobaltKeyCookie.js` does not exist.

- [ ] **Step 3: Implement the minimal cookie vault and API**

Use Node `crypto.createHash('sha256')` to derive a 32-byte encryption key from `COBALT_COOKIE_SECRET`, `randomBytes(12)` for the IV, and AES-256-GCM. Encode `version.iv.tag.ciphertext` with base64url. Reject empty/oversized Cobalt keys and secrets shorter than 32 characters.

`api/cobalt-key.js` must set `Cache-Control: no-store`, never return the key, and use a 180-day Max-Age. In production the cookie is always `Secure`; local development may omit `Secure` only when `VERCEL_ENV` is absent and the request is localhost.

- [ ] **Step 4: Update Cobalt fallback authentication**

Replace `process.env.COBALT_API_KEY` in `api/cobalt-download.js` with cookie decryption. If no saved key is available, return HTTP 401 with `{ error: 'Save your Cobalt API key first.', code: 'cobalt_key_required' }`.

- [ ] **Step 5: Run unit tests and existing validation**

Run `npm run test:unit` and `npm run check`. Expected: both pass.

- [ ] **Step 6: Commit**

Commit message: `feat: store per-browser Cobalt keys securely`.

---

### Task 2: Normalized extraction contract and Vercel worker proxy

**Files:**
- Create: `src/shared/extractorContract.js`
- Create: `api/media-extract.js`
- Test: `tests/unit/extractorContract.test.mjs`

**Interfaces:**
- Produces `buildExtractionRequest(input)` that validates a public HTTP(S) source URL and normalizes `{ url, downloadMode, audioFormat, audioBitrate, videoQuality }`.
- Produces `normalizeWorkerResult(value)` returning one of `{ status:'ready', ... }`, `{ status:'picker', items:[...] }`, `{ status:'challenge', challenge, message, sourceUrl }`, `{ status:'fallback', reason }`.
- `/api/media-extract` POSTs the normalized request to `EXTRACTOR_WORKER_URL + '/extract'` with `Authorization: Bearer ${EXTRACTOR_WORKER_TOKEN}` and a 25-second timeout.
- The proxy does not read or forward `frxe_cobalt_key`.

- [ ] **Step 1: Write failing contract tests**

Cover allowed output options, HTTPS/HTTP URL acceptance, localhost/private literal rejection, challenge-code allowlist, ready/picker URL normalization, and fallback normalization.

- [ ] **Step 2: Verify RED with `npm run test:unit`**

Expected failure: `src/shared/extractorContract.js` is missing.

- [ ] **Step 3: Implement the contract and worker proxy**

`EXTRACTOR_WORKER_URL` must be HTTPS except localhost development. `EXTRACTOR_WORKER_TOKEN` is required. Map worker 401/403 to 502 without exposing secrets. Preserve worker `challenge` responses as HTTP 200 so the frontend can render them. Return `503 extractor_not_configured` when worker configuration is absent.

- [ ] **Step 4: Verify GREEN**

Run `npm run test:unit` and `npm run check`. Expected: pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add normalized extractor worker proxy`.

---

### Task 3: Python InnerTube + yt-dlp extractor worker

**Files:**
- Create: `extractor-worker/core.py`
- Create: `extractor-worker/app.py`
- Create: `extractor-worker/requirements.txt`
- Create: `extractor-worker/tests/test_core.py`
- Create: `render.yaml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- `core.extract_youtube_id(url) -> str|None`
- `core.ensure_public_url(url) -> normalized_url` resolves DNS and rejects non-global addresses.
- `core.classify_provider_message(message) -> challenge_code|None` with codes `login_required`, `captcha_required`, `consent_required`, `age_verification`, `drm_protected`.
- `core.choose_innertube_format(streaming_data, mode, quality) -> item|None` only returns entries containing a direct `url`; it never deciphers `signatureCipher`.
- `POST /extract` validates the worker bearer token, attempts InnerTube for YouTube URLs, then yt-dlp, then returns `fallback` if neither resolves public media.

- [ ] **Step 1: Add Python test execution to CI and write failing worker tests**

Add Python 3.13 setup to `.github/workflows/ci.yml`, install `extractor-worker/requirements.txt`, then run `python -m unittest discover -s extractor-worker/tests -v`. Tests cover YouTube ID extraction, private-address rejection, challenge classification, direct InnerTube format selection, skipping signature-cipher-only formats, and yt-dlp metadata normalization.

- [ ] **Step 2: Verify RED in branch CI**

Expected failure: `extractor-worker/core.py` and worker functions do not exist.

- [ ] **Step 3: Implement `core.py`**

Use standard-library URL parsing, `socket.getaddrinfo`, and `ipaddress.ip_address(...).is_global`. Implement deterministic format scoring: audio mode prefers audio-only/high bitrate direct URLs; video modes honor the requested height and prefer combined A/V where available. Never process `signatureCipher`/`cipher` values.

- [ ] **Step 4: Implement `app.py`**

Use FastAPI. Authenticate `Authorization: Bearer <EXTRACTOR_WORKER_TOKEN>`. For YouTube, call the InnerTube player endpoint with a conservative public client context and map playability failures through the challenge classifier. If no direct InnerTube URL is available, call `yt_dlp.YoutubeDL` with `skip_download=True`, `quiet=True`, `no_warnings=True`, and no cookie/credential options. Normalize direct format URLs or challenge messages. Do not use `--cookies`, browser-cookie extraction, username/password, CAPTCHA solving, or DRM options.

- [ ] **Step 5: Add dependencies and Render blueprint**

`requirements.txt` includes FastAPI, Uvicorn, and `yt-dlp[default]` with a 2026-compatible lower bound. `render.yaml` defines a Python web service rooted at `extractor-worker`, installs requirements, starts Uvicorn on `$PORT`, and declares `EXTRACTOR_WORKER_TOKEN` as a secret environment value.

- [ ] **Step 6: Verify GREEN**

Run worker unit tests in CI plus `python -m py_compile extractor-worker/core.py extractor-worker/app.py`. Expected: pass.

- [ ] **Step 7: Commit**

Commit message: `feat: add InnerTube and yt-dlp extractor worker`.

---

### Task 4: FRXE Save orchestration and challenge UI

**Files:**
- Modify: `src/music/MusicApp.tsx`
- Modify: `src/music/music.css`
- Modify: `tests/e2e/nont.spec.js`

**Interfaces:**
- Frontend first calls `/api/media-extract`.
- `ready` opens the returned media URL and reports the extractor.
- `picker` renders item links.
- `fallback` calls `/api/cobalt-download` using the browser's HttpOnly Cobalt cookie automatically.
- `challenge` renders a challenge card with provider message, `Open source`, and `Retry`; `drm_protected` is displayed but never bypassed.
- Cobalt key UI calls `/api/cobalt-key`; it never reads the cookie value.

- [ ] **Step 1: Write failing Playwright coverage**

Add tests that mock `/api/cobalt-key`, `/api/media-extract`, and `/api/cobalt-download` to prove: key save status is shown without echoing the key, InnerTube success does not call Cobalt, fallback calls Cobalt, challenge UI shows `Open source` and `Retry`, and a retry reissues `/api/media-extract`.

- [ ] **Step 2: Verify RED in CI**

Expected failure: current Save UI calls Cobalt directly and lacks the per-user key/challenge controls.

- [ ] **Step 3: Implement Save orchestration state**

Add key configured/input/busy state, extraction stage state, challenge state, and one `runSave()` function that implements exact order: media-extract → Cobalt only on `fallback`. Keep current download-mode/format/quality controls.

- [ ] **Step 4: Implement challenge and key UI**

Add a compact Cobalt-key card with Save/Remove buttons and configured status. Add challenge cards that preserve provider text and source URL. `Open source` opens the original URL with `noopener,noreferrer`; `Retry` reruns extraction. Do not add provider credential or cookie fields.

- [ ] **Step 5: Style the new controls**

Extend the existing liquid-glass design in `music.css`; preserve mobile responsiveness and reduced-motion behavior.

- [ ] **Step 6: Verify GREEN**

Run the full Playwright suite and production build in CI. Expected: all existing FRXE/Hub tests plus the new Save tests pass.

- [ ] **Step 7: Commit**

Commit message: `feat: orchestrate FRXE multi-extractor Save flow`.

---

### Task 5: Project invariants, security checks, and final integration

**Files:**
- Modify: `scripts/validate.mjs`
- Test: existing `tests/unit/*.test.mjs`, `tests/e2e/nont.spec.js`, `extractor-worker/tests/*.py`

**Interfaces:**
- Validator asserts the presence of per-browser cookie API, worker proxy, InnerTube then yt-dlp flow, challenge UI, no NewPipe, no global `COBALT_API_KEY`, and no provider cookie import flags.

- [ ] **Step 1: Add invariant assertions before changing production behavior further**

Assert `api/cobalt-download.js` does not use `process.env.COBALT_API_KEY`; `api/media-extract.js` never references the Cobalt cookie; worker source contains InnerTube attempt before yt-dlp attempt; frontend contains challenge controls; and `README.md` is absent from the branch diff.

- [ ] **Step 2: Run `npm run check` and fix only genuine integration issues**

Expected: pass after Tasks 1–4 are complete.

- [ ] **Step 3: Run the complete CI pipeline**

Required green evidence: project invariants, Node unit tests, Python worker unit tests, Python compile check, Vite production build, Chromium install, and Playwright browser E2E.

- [ ] **Step 4: Review the PR diff for scope/security**

Confirm no `voidnont/Frxe` change is possible because only `voidnont/nont.me` is being modified; confirm `README.md` unchanged; confirm no secrets are hard-coded; confirm no CAPTCHA/login/DRM bypass implementation exists.

- [ ] **Step 5: Merge only after fresh green CI**

Merge the PR to `main`, then verify the post-merge `main` CI and source-adapter workflow. Confirm any source-adapter follow-up commit changes only generated/source-version files and does not erase the Save integration.
