# Remove FRXE Render Extractor

## Goal
Remove the Render-based FRXE extractor/relay architecture from `nont.me` while keeping FRXE web playback working through the normal YouTube IFrame API in the browser.

## Scope

Remove:
- `render.yaml`
- the full `extractor-worker/` service and its tests/dependencies
- `api/audio-stream.js`
- `api/media-extract.js`
- `src/music/backgroundAudioPlayer.js`
- the FRXE Save tab, Save state, Save handlers, and Save UI that depend on `/api/media-extract`
- the `installBackgroundAudioPlayer()` import/call from `src/main.jsx`
- tests that only cover the removed extractor/relay path

Keep:
- FRXE search via `/api/youtube-search`
- recommendations
- library
- manual and generated playlists
- queue controls
- seek, volume, mute, shuffle, and repeat
- Media Session controls
- FRXE web version/source structure unless a source file import must change
- `README.md` unchanged

## Playback design
Restore the existing browser YouTube IFrame API flow already used by FRXE before the background-audio relay was added. `MusicApp069.tsx` will load `https://www.youtube.com/iframe_api`, create `YT.Player` on `#frxe-youtube-player`, and use the existing `loadVideoById`, play/pause, seek, volume, state-change, and error callbacks.

No Render worker, extractor token, extractor URL, media relay endpoint, or server-side playback proxy will remain in the repository.

## UI changes
Remove the Save navigation item and Save screen. Search, Home, Library, Settings, the player UI, and playlist flows remain.

## Error handling
If a YouTube video cannot be embedded, FRXE should surface a normal player error and let the user choose another result. No extractor fallback is added.

## Testing
Add/update tests to verify:
- FRXE no longer installs or references the background-audio shim
- source code no longer references `EXTRACTOR_WORKER_URL`, `EXTRACTOR_WORKER_TOKEN`, `/api/audio-stream`, or `/api/media-extract`
- the browser YouTube IFrame API playback wiring is present
- the Save tab is absent
- existing build/unit/browser checks still pass

## Trade-off
Normal YouTube embed restrictions apply. Some videos may reject embedded playback, and background playback can be suspended by the browser or OS.
