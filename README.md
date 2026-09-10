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
