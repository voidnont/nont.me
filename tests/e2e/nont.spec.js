import { expect, test } from '@playwright/test';

const FRXE_APP = {
  id: 'frxe',
  name: 'Frxe',
  availablePlatforms: ['windows'],
  assets: [{
    id: 1,
    repo: 'voidnont/Frxe-Windows',
    name: 'Frxe-Desktop-0.1.0-x64.msi',
    url: 'https://github.com/voidnont/Frxe-Windows/releases/download/v0.1.0/Frxe-Desktop-0.1.0-x64.msi',
    platform: 'windows',
    arch: 'x64',
    packageType: 'msi',
    installable: true,
  }],
};

function withAndroid(app = FRXE_APP) {
  const apk = {
    id: 2,
    repo: 'voidnont/frxe',
    name: 'frxe-arm64.apk',
    url: 'https://github.com/voidnont/frxe/releases/download/v1/frxe-arm64.apk',
    platform: 'android',
    arch: 'arm64',
    packageType: 'apk',
    installable: true,
  };
  return { ...app, availablePlatforms: ['windows', 'android'], assets: [...app.assets, apk] };
}

async function mockAppHubApis(page, { app = FRXE_APP, searchItems = [] } = {}) {
  await page.route('**/api/github-app?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('app') === 'frxe') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(app) });
      return;
    }
    const repo = url.searchParams.get('repo');
    const item = searchItems.find((candidate) => candidate.repo === repo) || searchItems[0];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item || {}) });
  });
  await page.route('**/api/github-search?*', async (route) => {
    const url = new URL(route.request().url());
    const platform = url.searchParams.get('platform');
    const items = platform && platform !== 'recommended'
      ? searchItems.filter((item) => item.availablePlatforms?.includes(platform))
      : searchItems;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, page: 1, hasMore: false }) });
  });
}

async function setDevice(page, signals) {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        platform: value.platform || '',
        mobile: Boolean(value.mobile),
        getHighEntropyValues: async () => value,
      },
    });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: value.platform || '' });
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: value.userAgent || '' });
  }, signals);
}

async function openSave(page) {
  await page.goto('/music');
  await page.locator('.frxe-nav').getByRole('button', { name: 'Save' }).click();
}

test('Windows visitor gets Frxe Windows download', async ({ page }) => {
  await setDevice(page, { platform: 'Windows', architecture: 'x86', bitness: '64', mobile: false, userAgent: 'Windows Test' });
  await mockAppHubApis(page);
  await page.goto('/');

  await expect(page).toHaveTitle('Nont');
  await expect(page.getByRole('heading', { name: 'Frxe' })).toBeVisible();
  const button = page.getByRole('button', { name: /Download Frxe for Windows/i });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-download-url', FRXE_APP.assets[0].url);
  await expect(page).toHaveURL(/127\.0\.0\.1/);
});

test('Android visitor handles Frxe APK availability', async ({ page }) => {
  const app = withAndroid();
  await setDevice(page, { platform: 'Android', architecture: 'arm', bitness: '64', mobile: true, userAgent: 'Android Test' });
  await mockAppHubApis(page, { app });
  await page.goto('/');

  const button = page.getByRole('button', { name: /Download Frxe for Android/i });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-download-url', app.assets[1].url);
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
    availablePlatforms: ['windows'], latestVersion: '1.0.0', primary: { name: 'Browser.msi', url: 'https://github.com/example/windows-browser/releases/download/v1/Browser.msi', platform: 'windows', arch: 'x64', installable: true },
  };
  const androidResult = {
    repo: 'example/android-browser', name: 'android-browser', owner: 'example', description: 'Android browser',
    availablePlatforms: ['android'], latestVersion: '2.0.0', primary: { name: 'Browser.apk', url: 'https://github.com/example/android-browser/releases/download/v2/Browser.apk', platform: 'android', arch: 'arm64', installable: true },
  };
  await mockAppHubApis(page, { searchItems: [windowsResult, androidResult] });
  await page.route('**/api/github-search?*', async (route) => {
    const url = new URL(route.request().url());
    seen.push(url);
    const platform = url.searchParams.get('platform');
    const items = platform === 'android' ? [androidResult] : [windowsResult, androidResult];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, page: 1, hasMore: false }) });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: /Search GitHub apps/i }).fill('browser');
  await expect(page.getByText('windows-browser')).toBeVisible();
  await page.getByRole('button', { name: 'Android', exact: true }).click();
  await expect.poll(() => seen.some((url) => url.searchParams.get('platform') === 'android')).toBe(true);
  await expect(page.getByText('android-browser')).toBeVisible();
  await expect(page.getByText('windows-browser')).toHaveCount(0);
});

test('direct owner/repo search resolves repository detail', async ({ page }) => {
  const seen = [];
  const detail = { repo: 'example/direct-app', name: 'direct-app', owner: 'example', description: 'Direct app', availablePlatforms: ['linux'], assets: [] };
  await mockAppHubApis(page, { searchItems: [detail] });
  await page.route('**/api/github-app?repo=*', async (route) => {
    seen.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });
  await page.route('**/api/github-search?*', async (route) => {
    seen.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: /Search GitHub apps/i }).fill('example/direct-app');
  await expect.poll(() => seen.some((url) => url.pathname.endsWith('/api/github-app') && url.searchParams.get('repo') === 'example/direct-app')).toBe(true);
  await expect(page.getByText('direct-app')).toBeVisible();
  expect(seen.some((url) => url.pathname.endsWith('/api/github-search'))).toBe(false);
});

test('mobile app hub has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setDevice(page, { platform: 'Windows', architecture: 'x86', bitness: '64', mobile: false, userAgent: 'Windows Test' });
  await mockAppHubApis(page);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: /Search GitHub apps/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download|Choose download/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

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
  for (const label of ['Home', 'Search', 'Save', 'Library', 'Settings']) await expect(nav.getByRole('button', { name: label })).toBeVisible();

  await nav.getByRole('button', { name: 'Search' }).click();
  const search = page.getByRole('textbox', { name: 'Search Frxe' });
  await search.fill('Artist Signal');
  await page.getByRole('button', { name: 'Search music' }).click();
  await expect(page.locator('.frxe-result-title', { hasText: /^Signal$/ })).toHaveCount(1);
  await expect(page.getByText('Official', { exact: true })).toBeVisible();
  await expect(page.getByText('Artist - Topic', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Official Video/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Signal', exact: true }).click();
  await expect(page.locator('.frxe-mini-player')).toBeVisible();
  await page.locator('.frxe-mini-main').click();
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();
});

test('FRXE Save uses media extraction directly', async ({ page }) => {
  let extractBody = null;
  await page.route('**/api/media-extract', async (route) => {
    extractBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'picker', extractor: 'innertube', items: [{ type: 'audio', url: 'https://media.example/song.m4a', filename: 'song.m4a' }] }) });
  });
  await openSave(page);
  await expect(page.getByText('Frxe Save · Extractors')).toBeVisible();
  await page.getByLabel('Media URL').fill('https://www.youtube.com/watch?v=example');
  await page.getByRole('button', { name: 'Save media' }).click();
  await expect.poll(() => extractBody).toMatchObject({ url: 'https://www.youtube.com/watch?v=example', downloadMode: 'audio', audioFormat: 'mp3', videoQuality: '1080' });
  await expect(page.getByText(/innertube found 1 downloadable item/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /song\.m4a/i })).toHaveAttribute('href', 'https://media.example/song.m4a');
});

test('FRXE Save shows unresolved extraction without another fallback', async ({ page }) => {
  await page.route('**/api/media-extract', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'InnerTube and yt-dlp could not extract this media.', sourceUrl: 'https://example.com/watch/1', extractor: 'yt-dlp' }) });
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
      ? { status: 'challenge', challenge: 'captcha_required', message: 'Please complete the CAPTCHA on the source site.', sourceUrl: 'https://example.com/watch/1', extractor: 'yt-dlp' }
      : { status: 'picker', extractor: 'yt-dlp', items: [{ type: 'video', url: 'https://media.example/after-retry.mp4', filename: 'after-retry.mp4' }] };
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
