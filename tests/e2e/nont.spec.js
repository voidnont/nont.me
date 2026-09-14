import { expect, test } from '@playwright/test';

const WINDOWS_ASSET = {
  id: 1,
  repo: 'voidnont/Frxe-Windows',
  name: 'Frxe-Desktop-0.1.0-x64.msi',
  url: 'https://github.com/voidnont/Frxe-Windows/releases/download/v0.1.0/Frxe-Desktop-0.1.0-x64.msi',
  size: 5505024,
  platform: 'windows',
  arch: 'x64',
  packageType: 'msi',
  installable: true,
  score: 45,
};

const ANDROID_ASSET = {
  id: 2,
  repo: 'voidnont/frxe',
  name: 'frxe-arm64.apk',
  url: 'https://github.com/voidnont/frxe/releases/download/v1.0.0/frxe-arm64.apk',
  size: 12000000,
  platform: 'android',
  arch: 'arm64',
  packageType: 'apk',
  installable: true,
  score: 45,
};

function frxeFixture({ android = false } = {}) {
  return {
    id: 'frxe',
    name: 'Frxe',
    description: 'Frxe test metadata',
    sources: [
      { repo: 'voidnont/Frxe-Windows', version: '0.1.0', assets: [WINDOWS_ASSET] },
      { repo: 'voidnont/frxe', version: android ? '1.0.0' : '', assets: android ? [ANDROID_ASSET] : [] },
    ],
    availablePlatforms: android ? ['windows', 'android'] : ['windows'],
    assets: android ? [WINDOWS_ASSET, ANDROID_ASSET] : [WINDOWS_ASSET],
  };
}

async function setDevice(page, { platform, architecture = '', bitness = '', mobile = false, userAgent = '' }) {
  await page.addInitScript(({ platform: p, architecture: a, bitness: b, mobile: m, userAgent: ua }) => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        platform: p,
        mobile: m,
        getHighEntropyValues: async () => ({ platform: p, architecture: a, bitness: b }),
      },
    });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: p });
    if (ua) Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
  }, { platform, architecture, bitness, mobile, userAgent });
}

async function mockAppHubApis(page, { frxe = frxeFixture(), searchResolver = () => [] } = {}) {
  await page.route('**/api/github-app?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('app') === 'frxe') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(frxe) });
      return;
    }
    const repo = url.searchParams.get('repo');
    const direct = searchResolver(url, { directRepo: repo });
    const item = Array.isArray(direct) ? direct[0] : direct;
    await route.fulfill({ status: item ? 200 : 404, contentType: 'application/json', body: JSON.stringify(item || { error: 'not found' }) });
  });
  await page.route('**/api/github-search?*', async (route) => {
    const url = new URL(route.request().url());
    const items = searchResolver(url) || [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, page: 1, hasMore: false }) });
  });
}

test('Windows visitor gets Frxe Windows download', async ({ page }) => {
  await setDevice(page, { platform: 'Windows', architecture: 'x86', bitness: '64', mobile: false, userAgent: 'Windows Test' });
  await mockAppHubApis(page);
  await page.goto('/');

  await expect(page).toHaveTitle('Nont');
  await expect(page.getByText('FRXE', { exact: true }).first()).toBeVisible();
  const button = page.getByRole('button', { name: /Download Frxe for Windows/i });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-download-url', WINDOWS_ASSET.url);
  await expect(page).toHaveURL(/\/$/);
});

test('Android visitor handles Frxe APK availability', async ({ page }) => {
  await setDevice(page, { platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android Test' });
  await mockAppHubApis(page, { frxe: frxeFixture({ android: true }) });
  await page.goto('/');

  const button = page.getByRole('button', { name: /Download Frxe for Android/i });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-download-url', ANDROID_ASSET.url);
});

test('Android visitor sees unavailable state when no APK is published', async ({ page }) => {
  await setDevice(page, { platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android Test' });
  await mockAppHubApis(page);
  await page.goto('/');

  const button = page.getByRole('button', { name: 'Android build not available yet' });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
});

test('unknown device chooses a download manually', async ({ page }) => {
  await setDevice(page, { platform: 'MysteryOS', userAgent: 'Mystery Browser' });
  await mockAppHubApis(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Choose download' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Unknown device')).toBeVisible();
});

test('GitHub app search filters by platform', async ({ page }) => {
  const seen = [];
  const windowsResult = {
    repo: 'example/windows-browser', name: 'windows-browser', owner: 'example', description: 'Windows browser',
    url: 'https://github.com/example/windows-browser', latestVersion: '2.0.0', availablePlatforms: ['windows'], assets: [{ ...WINDOWS_ASSET, repo: 'example/windows-browser', name: 'browser-x64.msi', url: 'https://github.com/example/windows-browser/releases/download/v2/browser-x64.msi' }],
  };
  const androidResult = {
    repo: 'example/android-browser', name: 'android-browser', owner: 'example', description: 'Android browser',
    url: 'https://github.com/example/android-browser', latestVersion: '3.0.0', availablePlatforms: ['android'], assets: [{ ...ANDROID_ASSET, repo: 'example/android-browser', name: 'browser-arm64.apk', url: 'https://github.com/example/android-browser/releases/download/v3/browser-arm64.apk' }],
  };
  await setDevice(page, { platform: 'Windows', architecture: 'x86', bitness: '64', userAgent: 'Windows Test' });
  await mockAppHubApis(page, {
    searchResolver: (url) => {
      if (url.pathname.includes('/api/github-search')) {
        seen.push(url.toString());
        return url.searchParams.get('platform') === 'android' ? [androidResult] : [windowsResult, androidResult];
      }
      return [];
    },
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search GitHub apps' }).fill('browser');
  await expect(page.getByRole('heading', { name: 'windows-browser' })).toBeVisible();
  await page.getByRole('tab', { name: 'Android' }).click();
  await expect(page.getByRole('heading', { name: 'android-browser' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'windows-browser' })).toHaveCount(0);
  await expect.poll(() => seen.some((value) => new URL(value).searchParams.get('platform') === 'android')).toBe(true);
});

test('direct owner/repo search resolves repository detail', async ({ page }) => {
  const directResult = {
    repo: 'example/tool', name: 'tool', owner: 'example', description: 'Direct repo', url: 'https://github.com/example/tool',
    version: '1.0.0', latestVersion: '1.0.0', availablePlatforms: ['windows'], assets: [{ ...WINDOWS_ASSET, repo: 'example/tool' }],
  };
  let directSeen = false;
  await setDevice(page, { platform: 'Windows', architecture: 'x86', bitness: '64', userAgent: 'Windows Test' });
  await mockAppHubApis(page, {
    searchResolver: (url, context = {}) => {
      if (context.directRepo === 'example/tool') directSeen = true;
      return context.directRepo === 'example/tool' ? directResult : [];
    },
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search GitHub apps' }).fill('example/tool');
  await expect(page.getByRole('heading', { name: 'tool' })).toBeVisible();
  expect(directSeen).toBe(true);
});

test('mobile app hub has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setDevice(page, { platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android Test' });
  await mockAppHubApis(page, { frxe: frxeFixture({ android: true }) });
  await page.goto('/');

  await expect(page.getByRole('textbox', { name: 'Search GitHub apps' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download Frxe for Android/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function openSave(page) {
  await page.goto('/music');
  await page.locator('.frxe-nav').getByRole('button', { name: 'Save' }).click();
}

test('Frxe web player mirrors the five-tab app shell and music ranking', async ({ page }) => {
  await page.route('**/api/youtube-search?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: 'lyrics-copy', title: 'Artist - Signal [Lyrics]', artist: 'Artist', thumbnail: 'https://i.ytimg.com/vi/lyrics-copy/hqdefault.jpg', official: false },
          { id: 'official-copy', title: 'Artist - Signal (Official Video)', artist: 'Artist - Topic', thumbnail: 'https://i.ytimg.com/vi/official-copy/hqdefault.jpg', official: true, topic: true },
          { id: 'reaction', title: 'Signal reaction', artist: 'Random Channel', thumbnail: 'https://i.ytimg.com/vi/reaction/hqdefault.jpg', official: false },
        ],
      }),
    });
  });

  await page.goto('/music');
  await expect(page).toHaveTitle('FRXE');
  await expect(page.getByRole('heading', { name: 'FRXE' })).toBeVisible();

  const nav = page.locator('.frxe-nav');
  const navButtons = nav.getByRole('button');
  await expect(navButtons).toHaveCount(5);
  for (const label of ['Home', 'Search', 'Save', 'Library', 'Settings']) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible();
  }

  await nav.getByRole('button', { name: 'Search' }).click();
  const search = page.getByRole('textbox', { name: 'Search Frxe' });
  await search.fill('Artist Signal');
  await page.getByRole('button', { name: 'Search music' }).click();

  await expect(page.locator('.frxe-result-title', { hasText: /^Signal$/ })).toHaveCount(2);
  await expect(page.getByText('Official', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Artist - Topic', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Official Video/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Play Signal', exact: true }).first().click();
  await expect(page.locator('.frxe-mini-player')).toBeVisible();
  await page.locator('.frxe-mini-main').click();
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();
});

test('FRXE Save uses media extraction directly', async ({ page }) => {
  let extractBody = null;
  await page.route('**/api/media-extract', async (route) => {
    extractBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'picker',
        extractor: 'innertube',
        items: [{ type: 'audio', url: 'https://media.example/song.m4a', filename: 'song.m4a' }],
      }),
    });
  });

  await openSave(page);
  await expect(page.getByText('Frxe Save · Extractors')).toBeVisible();
  await page.getByLabel('Media URL').fill('https://www.youtube.com/watch?v=example');
  await page.getByRole('button', { name: 'Save media' }).click();

  await expect.poll(() => extractBody).toMatchObject({
    url: 'https://www.youtube.com/watch?v=example',
    downloadMode: 'audio',
    audioFormat: 'mp3',
    videoQuality: '1080',
  });
  await expect(page.getByText(/innertube found 1 downloadable item/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /song\.m4a/i })).toHaveAttribute('href', 'https://media.example/song.m4a');
});

test('FRXE Save shows unresolved extraction without another fallback', async ({ page }) => {
  await page.route('**/api/media-extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        message: 'InnerTube and yt-dlp could not extract this media.',
        sourceUrl: 'https://example.com/watch/1',
        extractor: 'yt-dlp',
      }),
    });
  });

  await openSave(page);
  await page.getByLabel('Media URL').fill('https://example.com/watch/1');
  await page.getByRole('button', { name: 'Save media' }).click();
  await expect(page.getByText('InnerTube and yt-dlp could not extract this media.')).toBeVisible();
});

test('FRXE Save surfaces provider challenge with Open source and Retry', async ({ page }) => {
  let extractCalls = 0;
  await page.route('**/api/media-extract', async (route) => {
    extractCalls += 1;
    const body = extractCalls === 1
      ? {
          status: 'challenge',
          challenge: 'captcha_required',
          message: 'Please complete the CAPTCHA on the source site.',
          sourceUrl: 'https://example.com/watch/1',
          extractor: 'yt-dlp',
        }
      : {
          status: 'picker',
          extractor: 'yt-dlp',
          items: [{ type: 'video', url: 'https://media.example/after-retry.mp4', filename: 'after-retry.mp4' }],
        };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await openSave(page);
  await page.getByLabel('Media URL').fill('https://example.com/watch/1');
  await page.getByRole('button', { name: 'Save media' }).click();

  const challengeCard = page.locator('.frxe-save-picker', { has: page.getByText(/Action required/i) });
  await expect(challengeCard.getByText('Please complete the CAPTCHA on the source site.')).toBeVisible();
  await expect(challengeCard.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/watch/1');
  await challengeCard.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => extractCalls).toBe(2);
  await expect(page.getByText(/yt-dlp found 1 downloadable item/i)).toBeVisible();
});