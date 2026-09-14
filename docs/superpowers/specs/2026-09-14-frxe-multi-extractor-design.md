# FRXE Multi-Extractor Save Design

## Goal

Upgrade the FRXE web Save flow in `voidnont/nont.me` so public media extraction tries InnerTube first, yt-dlp second, and Cobalt last, while keeping each user's Cobalt API key in that user's browser as an encrypted `HttpOnly` cookie. Provider challenges such as login, CAPTCHA, consent, or age verification are surfaced to the user instead of being hidden or bypassed.

## Scope

This change is limited to `voidnont/nont.me`. It does not modify `voidnont/Frxe`. The repository README remains unchanged. NewPipe Extractor is explicitly out of scope.

## User flow

1. The FRXE Save tab accepts a public HTTP(S) media URL and the existing audio/video output options.
2. The browser calls a same-origin nont.me extraction API.
3. The nont.me API calls a separately deployable extractor worker that lives in this repository.
4. The worker tries InnerTube for YouTube URLs first. If it cannot produce a usable public stream result, it tries yt-dlp.
5. If the worker reports that neither extractor can handle the URL, nont.me falls back to the configured Cobalt instance.
6. Cobalt authentication uses the current browser's saved Cobalt key, not a global key exposed to users.
7. If a provider reports login, CAPTCHA, consent, age verification, or another human-action challenge, the UI shows the challenge, the source URL, an `Open source` action, and a `Retry` action. FRXE does not automate or bypass the challenge.
8. If a provider reports DRM, the UI shows that the source is DRM-protected. FRXE does not attempt DRM circumvention.

## Per-user Cobalt key

The Save screen contains a small Cobalt key control. The user enters their own key once. The browser POSTs the key to `/api/cobalt-key`; the server encrypts it using AES-256-GCM with `COBALT_COOKIE_SECRET` and returns a cookie named `frxe_cobalt_key` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and a long-lived expiration. JavaScript can only ask whether a key is configured; it can never read the saved key value.

`GET /api/cobalt-key` returns `{ configured: boolean }`. `POST /api/cobalt-key` validates and stores a supplied key. `DELETE /api/cobalt-key` clears it. `/api/cobalt-download` decrypts the cookie and uses it for Cobalt authentication. The extractor worker never receives the Cobalt key.

## Extractor worker

Add an `extractor-worker/` Python service that can run separately on Render while remaining part of this repository. Use Python 3.11+ and the maintained `yt-dlp` package. A small HTTP endpoint accepts normalized extraction requests from nont.me and returns one of these normalized result types:

- `ready`: one downloadable URL plus filename/mime metadata.
- `picker`: multiple downloadable items.
- `challenge`: a human-action requirement such as `login_required`, `captcha_required`, `consent_required`, `age_verification`, or `drm_protected`.
- `fallback`: the worker could not resolve the public URL and nont.me should try Cobalt.
- `error`: a non-retryable malformed request or worker error.

The worker is protected by `EXTRACTOR_WORKER_TOKEN`; nont.me sends that token server-to-server. It validates target URLs and rejects loopback, link-local, private, and otherwise non-public targets to avoid SSRF.

### InnerTube stage

For recognized YouTube watch/short/share URLs, the worker extracts the video ID and calls YouTube's InnerTube player endpoint. It inspects playability status and streaming data. If a direct stream URL is present, it chooses a best-fit result for the requested audio/video mode and quality. If InnerTube returns only signature-ciphered formats or otherwise cannot produce a direct stream, processing continues to yt-dlp rather than attempting custom signature bypass logic.

### yt-dlp stage

The worker invokes yt-dlp through its Python API with downloading disabled and reads metadata/formats only. It selects a public direct media URL according to the requested mode and quality. Errors are classified into normalized challenge codes when the provider explicitly requires login, CAPTCHA, consent, age verification, or DRM. FRXE does not collect provider session cookies or credentials and does not automate challenge solving.

The worker should use current yt-dlp releases and Python 3.11+, because yt-dlp's current project guidance recommends modern Python and keeps provider extraction logic updated frequently.

## Cobalt fallback

Cobalt remains configured by `COBALT_API_URL`. The user's encrypted-cookie key is sent as the instance's `Authorization` value using `COBALT_AUTH_SCHEME` (default `Api-Key`). If no user key is configured, the UI asks that user to save one before Cobalt fallback can run. No default shared `COBALT_API_KEY` is required for this flow.

## Frontend behavior

The existing Save UI keeps audio/video format controls. Add:

- extractor status text showing which backend succeeded (`InnerTube`, `yt-dlp`, or `Cobalt`),
- a Cobalt key configured/not-configured control,
- challenge cards with source message, `Open source`, and `Retry`,
- no provider-cookie import UI,
- no CAPTCHA solver, login automation, or DRM bypass.

The browser starts downloads only from normalized `ready`/`picker` URLs returned by the server/worker.

## Deployment

Vercel continues hosting nont.me and the FRXE web UI. The Python worker is deployed separately, for example on Render, from `extractor-worker/`. nont.me uses `EXTRACTOR_WORKER_URL` and `EXTRACTOR_WORKER_TOKEN` to call it. The worker uses the matching `EXTRACTOR_WORKER_TOKEN`. `COBALT_API_URL`, `COBALT_COOKIE_SECRET`, and optional `COBALT_AUTH_SCHEME` stay on Vercel.

## Testing

Use test-driven development. Add Node unit tests for cookie encryption/decryption and normalized web extraction orchestration, Python tests for URL safety, challenge classification, InnerTube result selection, and yt-dlp normalization, and Playwright coverage for key save/remove state, extractor success, Cobalt fallback, and challenge display/retry. CI must still pass existing validation, unit, production build, and browser E2E checks.

## Security and non-goals

- Do not expose Cobalt keys to page JavaScript.
- Do not forward Cobalt keys to the extractor worker.
- Do not collect or import provider login cookies or credentials.
- Do not automate CAPTCHA solving or authentication challenges.
- Do not circumvent DRM or other technical access controls.
- Do not allow extraction requests to private/internal network targets.
- Do not modify `voidnont/Frxe` or the repository README.
