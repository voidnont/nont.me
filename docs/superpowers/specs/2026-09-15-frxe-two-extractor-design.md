# FRXE Two-Extractor Save Design

## Goal

FRXE Web Save uses exactly two extraction stages: **InnerTube first, yt-dlp second**. Cobalt is removed entirely.

## Scope

- Modify only `voidnont/nont.me`.
- Do not modify `voidnont/Frxe`.
- Do not modify `README.md`.
- Do not use NewPipe Extractor.
- Do not retain dormant Cobalt code or configuration.

## Save flow

1. User pastes a public HTTP(S) media URL into FRXE Web Save.
2. The nont.me API forwards a normalized extraction request to the extractor worker.
3. For YouTube URLs, the worker tries InnerTube first.
4. If InnerTube cannot return a usable direct stream, the worker tries yt-dlp.
5. If yt-dlp succeeds, return a normalized ready/picker result.
6. If both fail, return a clear extraction error. There is no third-party fallback.

## Access challenges

If a provider reports login, CAPTCHA, consent, age verification, or a similar human-action requirement, FRXE returns a structured challenge to the UI. The UI shows the provider message with **Open source** and **Retry** actions so the user can complete the provider's normal flow themselves.

FRXE does not automate CAPTCHA solving, authentication, credential entry, session-cookie import, or access-control bypass. DRM-protected media is shown as DRM-protected and is not circumvented.

## Worker

The separately deployable worker remains in this repository and is protected by `EXTRACTOR_WORKER_TOKEN`. It validates target URLs and rejects loopback, private, link-local, and non-HTTP(S) targets.

InnerTube only uses directly returned stream URLs. It does not implement custom signature-cipher bypass logic. yt-dlp runs without provider credentials or imported browser cookies.

## Cobalt removal

The final repository must contain no active Cobalt integration:

- no `/api/cobalt-download` or `/api/cobalt-key` endpoints;
- no Cobalt key UI or browser cookie;
- no `COBALT_API_URL`, `COBALT_API_KEY`, `COBALT_COOKIE_SECRET`, or `COBALT_AUTH_SCHEME` usage;
- no Cobalt fallback from the Save flow;
- no Cobalt-specific unit/E2E tests or validation requirements.

Historical commits may still contain old Cobalt work, but the resulting branch and final `main` tree must not.

## Testing

Tests must prove:

- InnerTube is attempted before yt-dlp for YouTube URLs;
- yt-dlp handles fallback from an unusable InnerTube result;
- login/CAPTCHA/consent/age/DRM challenges are surfaced, not bypassed;
- private/internal target URLs are rejected;
- the frontend renders Open source + Retry for actionable challenges;
- no Cobalt code/config remains in the final tree;
- existing build, Node unit, Python worker, and Playwright tests remain green.
