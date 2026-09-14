# nont.me

nont.me is a device-aware GitHub app discovery and download hub. It searches public GitHub repositories, inspects their published release assets, and recommends the package that matches the visitor's operating system and architecture when that information is available.

## Featured app: Frxe

Frxe appears as one logical app even though its platform builds live in separate repositories:

- `voidnont/Frxe-Windows` — Windows releases such as MSI/EXE packages.
- `voidnont/frxe` — Android/mobile releases such as APK packages.

The root site automatically selects a compatible release for Windows, Android, macOS, Linux, or iOS when an actual installable asset exists. Unknown devices are never guessed; users can choose another download manually.

## GitHub search

The root site supports free-text GitHub repository search and direct `owner/repo` input. Platform labels come from actual release files rather than README claims. Supported package detection includes Windows installers, APK/AAB, DMG/PKG, AppImage/DEB/RPM/Flatpak/Snap, IPA, and architecture markers such as x64 and arm64.

GitHub requests are performed by server-side Vercel functions. Set the optional `GITHUB_TOKEN` environment variable for higher GitHub API rate limits. The token is never sent to browser code.

## FRXE web player

`/music` and `music.nont.me` remain the FRXE web player, including music search, playback, library, and the server-side Cobalt Save bridge.

## Development

```bash
npm install
npm run check
npm run test:unit
npm run build
npm run test:e2e
```

The Vercel production build runs validation before Vite builds the site. GitHub Actions also runs validation, unit tests, the production build, and Playwright browser tests.
