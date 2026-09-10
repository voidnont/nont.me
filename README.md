# NONT Web Suite

One GitHub repository and one Vercel project containing both:

- **NONT Nexus Web** — the default site (`nont.me`)
- **NONT Music Web** — selected automatically on `music.nont.me`
- **Open Web Player** button on the main Nexus homepage points to `https://music.nont.me`

The music player is also available at `/music`, useful on Vercel preview URLs.

## NONT Music Web

The web player searches YouTube from a Vercel server function using YouTube's signed-out WEB InnerTube endpoint and plays selected results through the official YouTube IFrame Player API.

It includes:

- YouTube music search
- No Google/YouTube developer API key required
- Embedded YouTube playback
- Play / pause / previous / next
- Seek bar and volume
- Shuffle and repeat
- Queue
- Favorites saved locally in the browser
- Real NONT branding
- No download feature

## YouTube search setup

There is nothing to configure in Google Cloud and no `YOUTUBE_API_KEY` environment variable.

`/api/youtube-search` uses the signed-out WEB InnerTube search endpoint. It discovers the current WEB client version from YouTube when possible and falls back to known WEB client versions if discovery fails.

This avoids a Google Data API quota tied to your account. It is not guaranteed unlimited: YouTube can still rate-limit requests, block automated traffic, or change its internal WEB API behavior.

## Vercel deployment

Import this single repository into Vercel with:

- Framework: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- YouTube environment variables: **none**

No AI chat is included.

## Domains

Attach both domains to the same Vercel project:

- `nont.me`
- `music.nont.me`

The application checks the hostname in the browser. `music.nont.me` renders only NONT Music; `nont.me` renders NONT Nexus and includes the **Open Web Player** button.

## Playback architecture

The desktop NONT build uses Tauri/Rust and local tools such as yt-dlp. Those are not used by the web player. Web playback uses YouTube's embedded player and intentionally exposes no audio/video download action.
