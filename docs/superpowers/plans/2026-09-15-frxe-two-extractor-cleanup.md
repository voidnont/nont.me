# FRXE Two-Extractor Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the approved FRXE Save architecture by removing the last retired third-party fallback validation vestige and verifying that current `main` is strictly InnerTube → yt-dlp with visible provider challenges and no third extraction stage.

**Architecture:** The existing Vercel `/api/media-extract` proxy remains the only browser-facing extraction API. The existing worker under `extractor-worker/` tries InnerTube first for YouTube, then yt-dlp; terminal results are `ready`, `picker`, `challenge`, or `error`. No retired third-party endpoint, key, cookie, environment variable, fallback response, or dedicated validation remains.

**Tech Stack:** React 19 + Vite, Vercel serverless Node APIs, Python 3.13 worker, FastAPI, yt-dlp, Node test runner, Python unittest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-frxe-two-extractor-design.md`

## Global Constraints

- Modify only `voidnont/nont.me`.
- Do not modify `voidnont/Frxe`.
- Do not modify `README.md`.
- Extraction order remains InnerTube first, yt-dlp second.
- Do not use NewPipe Extractor.
- Do not retain active or dormant integration/configuration for a retired third extraction service.
- Login, CAPTCHA, consent, age verification, and DRM are surfaced to the user, not bypassed.
- Do not collect provider credentials or browser session cookies.
- Preserve SSRF protections for extraction target URLs.

---

### Task 1: Remove the final retired-bridge validator vestige

**Files:**
- Modify: `scripts/validate.mjs`

**Interfaces:**
- Consumes: the current project invariant script.
- Produces: the same validator without the `retiredBridge` variable or the two bridge-specific file-existence checks.

- [ ] **Step 1: Confirm the pre-change vestige exists**

Inspect `scripts/validate.mjs` and confirm it contains a `retiredBridge` variable built from split string fragments and two file-existence checks for a retired third-party bridge.

Expected: the declaration and both checks are present before cleanup.

- [ ] **Step 2: Remove only those bridge-specific lines**

Delete the `retiredBridge` declaration and both related `expect(...)` checks. Do not change unrelated validation rules.

- [ ] **Step 3: Validate the edited file structurally**

Verify `scripts/validate.mjs` still imports `fs` and `path`, still checks `api/media-extract.js`, `src/shared/extractorContract.js`, challenge UI, worker configuration, and CI commands, and contains no `retiredBridge` variable.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate.mjs
git commit -m "chore: remove retired fallback validation vestige"
```

---

### Task 2: Verify the two-extractor contract and challenge behavior

**Files:**
- Verify: `extractor-worker/pipeline.py`
- Verify: `extractor-worker/extractors.py`
- Verify: `src/shared/extractorContract.js`
- Verify: `src/music/MusicApp.tsx`
- Verify: `tests/unit/extractorContract.test.mjs`
- Verify: `tests/unit/noLegacyExtractorReferences.test.mjs`
- Verify: `extractor-worker/tests/test_pipeline.py`
- Verify: `tests/e2e/nont.spec.js`

**Interfaces:**
- `extract_media(request, innertube_extract, ytdlp_extract)` tries InnerTube for YouTube URLs, then yt-dlp, then returns an error.
- `normalizeWorkerResult(value)` accepts `ready`, `picker`, `challenge`, and `error`; it rejects legacy `fallback`.
- FRXE Save calls only `/api/media-extract` and displays challenge `Open source` + `Retry` controls.

- [ ] **Step 1: Verify extraction order from the worker tests and implementation**

Confirm `extractor-worker/pipeline.py` calls `innertube_extract(request)` before `ytdlp_extract(request)` for YouTube URLs, and `extractor-worker/tests/test_pipeline.py` asserts that order.

Expected: InnerTube is first and yt-dlp is second.

- [ ] **Step 2: Verify there is no third-stage fallback contract**

Confirm `tests/unit/extractorContract.test.mjs` rejects `{ status: 'fallback' }` as an unsupported response and `src/shared/extractorContract.js` has no accepted `fallback` branch.

Expected: legacy fallback results are rejected.

- [ ] **Step 3: Verify challenge handling**

Confirm the contract allowlist contains `login_required`, `captcha_required`, `consent_required`, `age_verification`, and `drm_protected`. Confirm FRXE renders `Open source` and `Retry`, and no provider credential/cookie input exists.

Expected: challenges are visible and user-driven; no bypass logic exists.

- [ ] **Step 4: Verify repository-wide retired-service absence**

Run the existing `tests/unit/noLegacyExtractorReferences.test.mjs` as part of `npm run test:unit`.

Expected: zero repository references to the retired service, including filenames and documentation content.

---

### Task 3: Full verification and integration

**Files:**
- Verify only; no README edits.

**Interfaces:**
- CI must prove project validation, Node unit tests, Python worker tests/compile, Vite build, and Playwright E2E all pass.

- [ ] **Step 1: Open a PR from `frxe-two-extractor-cleanup` to `main`**

Use a title describing removal of the final retired-fallback vestige without naming the retired service.

PR body must state that production extraction was already InnerTube → yt-dlp and this change removes the remaining bridge-specific validator vestige while documenting/confirming the two-extractor architecture.

- [ ] **Step 2: Run/inspect required CI**

Required successful steps:

```text
npm run check
npm run test:unit
python -m unittest discover -s extractor-worker/tests -v
python -m py_compile extractor-worker/core.py extractor-worker/pipeline.py extractor-worker/extractors.py extractor-worker/app.py
npm run build
npm run test:e2e:ci
```

Expected: all pass.

- [ ] **Step 3: Review the PR diff**

Confirm:

```text
README.md is unchanged
No active or dormant retired third-party extraction integration/configuration exists
No NewPipe code exists
No login/CAPTCHA/DRM bypass was added
Only approved docs plus the validator cleanup changed
```

- [ ] **Step 4: Merge after green CI and verify main**

Merge the PR only after CI is green. Then confirm post-merge `main` CI succeeds and the scheduled source adapter, if it creates a follow-up commit, changes only generated/source-metadata files rather than the Save architecture.
