function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasPath(paths, target) {
  const normalized = String(target).toLowerCase();
  return paths.some((path) => String(path).toLowerCase() === normalized);
}

function hasScript(pkg, matcher) {
  return Object.keys(pkg?.scripts || {}).some((name) => matcher.test(name));
}

export function inferSourceContract({ repo, pkg = {}, sourcePaths = [], appSource = '' }) {
  const key = String(repo || '').toLowerCase();
  const platforms = [];
  const capabilities = [];

  const hasTauri = Boolean(pkg?.dependencies?.['@tauri-apps/api'] || pkg?.devDependencies?.['@tauri-apps/cli']);
  if (hasTauri || hasScript(pkg, /windows|tauri/)) platforms.push('Windows');
  if (hasScript(pkg, /android/) || hasPath(sourcePaths, 'src/AndroidApp.tsx') || key.endsWith('/frxe')) platforms.push('Android');
  if (hasScript(pkg, /ios/)) platforms.push('iOS');

  if (key.endsWith('/nontmusic')) {
    if (hasPath(sourcePaths, 'src/lyrics.ts')) capabilities.push('Lyrics');
    if (hasPath(sourcePaths, 'src/recommendations.ts')) capabilities.push('Recommendations');
    if (hasPath(sourcePaths, 'src/plugins.ts')) capabilities.push('Plugins');
    if (hasPath(sourcePaths, 'src/i18n.ts')) capabilities.push('Localization');
    if (hasPath(sourcePaths, 'src/overlay.tsx')) capabilities.push('Overlay player');
    if (/\bqueue\b/i.test(appSource)) capabilities.push('Queue');
    if (/\bdownload/i.test(appSource)) capabilities.push('Downloads');
    if (/\bcrossfade\b/i.test(appSource)) capabilities.push('Crossfade');
    if (/\bshuffle\b/i.test(appSource)) capabilities.push('Shuffle');
    if (/\brepeat\b/i.test(appSource)) capabilities.push('Repeat');
  }

  if (key.endsWith('/nonthub')) {
    if (/\binstaller\b/i.test(appSource)) capabilities.push('Installer');
    if (/\bdownloads?\b/i.test(appSource)) capabilities.push('Downloads');
    if (/\blibrary\b/i.test(appSource)) capabilities.push('Library');
    if (/\bsettings\b/i.test(appSource)) capabilities.push('Settings');
    if (/custom\s+repo|customRepo/i.test(appSource)) capabilities.push('Custom repositories');
    if (hasPath(sourcePaths, 'src/AndroidApp.tsx')) capabilities.push('Android app');
    if (hasPath(sourcePaths, 'src/icon-fixes.css')) capabilities.push('Icon fixes');
  }

  if (key.endsWith('/frxe')) {
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/components/Glass.kt')) capabilities.push('Liquid Glass');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/screens/HomeScreen.kt')) capabilities.push('Home');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/screens/SearchScreen.kt')) capabilities.push('Search');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/screens/SaveScreen.kt')) capabilities.push('Save');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/screens/LibraryScreen.kt')) capabilities.push('Library');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/ui/screens/NowPlayingScreen.kt')) capabilities.push('Now Playing');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/lyrics/LyricsRepository.kt')) capabilities.push('Lyrics');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/social/ListenTogether.kt')) capabilities.push('Listen Together');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/voice/VoskVoiceController.kt')) capabilities.push('Voice');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/java/com/frxe/music/cast/FrxeCastOptionsProvider.kt')) capabilities.push('Cast');
    if (hasPath(sourcePaths, 'Frxe/app/src/main/res/xml/automotive_app_desc.xml')) capabilities.push('Android Auto');
    if (/\bqueue/i.test(appSource)) capabilities.push('Queue');
    if (/\bshuffle\b/i.test(appSource)) capabilities.push('Shuffle');
    if (/\brepeat\b/i.test(appSource)) capabilities.push('Repeat');
  }

  return {
    version: String(pkg?.version || '').trim(),
    name: String(pkg?.name || '').trim(),
    description: String(pkg?.description || '').trim(),
    platforms: unique(platforms),
    capabilities: unique(capabilities),
  };
}

export function contractSummary(contract) {
  const parts = [];
  if (contract?.description) parts.push(contract.description);
  if (contract?.platforms?.length) parts.push(`Platforms: ${contract.platforms.join(', ')}`);
  if (contract?.capabilities?.length) parts.push(`Source features: ${contract.capabilities.join(', ')}`);
  return parts.join(' · ');
}
