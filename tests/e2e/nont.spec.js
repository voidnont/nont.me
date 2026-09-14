import { expect, test } from '@playwright/test';

const NONT_ICON = 'https://raw.githubusercontent.com/voidnont/nont/main/src-tauri/icons/icon.png';

function repoPayload(repo, fresh = false) {
  const versions = {
    'voidnont/nont': fresh ? '9.9.8' : '0.4.4',
    'voidnont/Frxe': fresh ? '9.9.9' : '0.5.0',
    'voidnont/veilbrowser': fresh ? '9.9.7' : '0.8.0',
  };
  const version = versions[repo] || '1.0.0';
  return {
    status: 'ready',
    repo,
    description: `${repo} test metadata`,
    sourceVersion: version,
    releaseVersion: version,
    sourceAheadOfRelease: false,
    releaseUrl: `https://github.com/${repo}/releases`,
    syncedAt: '2026-09-13T00:00:00.000Z',
    asset: {
      id: 1,
      name: `${repo.split('/').pop()}-Setup.exe`,
      size: 12582912,
      url: `https://github.com/${repo}/releases/download/v${version}/setup.exe`,
      type: 'exe',
    },
  };
}

async function mockHubApis(page, seen = []) {
  await page.route('**/api/github-sync?repo=*', async (route) => {
    const url = new URL(route.request().url());
    const repo = url.searchParams.get('repo') || 'voidnont/nont';
    const fresh = url.searchParams.get('fresh') === '1';
    seen.push(url);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(repoPayload(repo, fresh)) });
  });
}

async function openSave(page) {
  await page.goto('/music');
  await page.locator('.frxe-nav').getByRole('button', { name: 'Save' }).click();
}

async function mockCobaltKeyState(page, configured = true) {
  await page.route('**/api/cobalt-key', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured }) });
      return;
    }
    await route.continue();
  });
}

test('Hub exposes Installer with Install and Update modes', async ({ page }) => {
  await mockHubApis(page);
  await page.goto('/');

  await expect(page).toHaveTitle('NontHub');
  await expect(page.getByRole('heading', { name: /Your apps/i })).toBeVisible();

  await page.locator('.sidebar nav').getByRole('button', { name: 'Installer' }).click();
  await expect(page.getByRole('heading', { name: 'Installer' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Install' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Update' }).click();
  await expect(page.getByRole('tab', { name: 'Update' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Update your current installation')).toBeVisible();
  await expect(page.getByRole('button', { name: /Update NontHub/i })).toBeVisible();
});

test('catalog contains only NontHub, Frxe Web, and Veil while the sidebar has no mini-card', async ({ page }) => {
  await mockHubApis(page);
  await page.goto('/');

  await expect(page.locator('.sidebar-bottom .mini')).toHaveCount(0);
  await expect(page.locator('.app-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'NontHub' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FRXE Web' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Veil Browser' })).toBeVisible();

  await page.locator('.sidebar nav').getByRole('button', { name: 'Library' }).click();
  await expect(page.locator('.app-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Veil Browser' })).toBeVisible();
});

test('manual GitHub sync force-refreshes Nont, Frxe, and Veil including Frxe Web version', async ({ page }) => {
  const seen = [];
  await mockHubApis(page, seen);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FRXE Web' })).toBeVisible();

  seen.length = 0;
  await page.getByRole('button', { name: 'Sync GitHub' }).click();

  await expect.poll(() => seen
    .filter((url) => url.searchParams.get('fresh') === '1')
    .map((url) => url.searchParams.get('repo'))
    .sort()).toEqual(['voidnont/Frxe', 'voidnont/nont', 'voidnont/veilbrowser']);

  const frxeCard = page.locator('.app-card', { has: page.getByRole('heading', { name: 'FRXE Web' }) });
  await expect(frxeCard).toContainText('v9.9.9');
});

test('Nont browser uses the canonical Nont app icon', async ({ page }) => {
  await mockHubApis(page);
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', NONT_ICON);
});

test('mobile Hub navigation contains exactly five destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHubApis(page);
  await page.goto('/');

  const navButtons = page.locator('.sidebar nav .nav-item');
  await expect(navButtons).toHaveCount(5);
  await expect(navButtons).toContainText(['Home', 'Library', 'Downloads', 'Installer', 'Settings']);
});

test('Frxe web player mirrors the five-tab app shell and music ranking', async ({ page }) => {
  await page.route('**/api/youtube-search?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'lyrics-copy',
            title: 'Artist - Signal [Lyrics]',
            artist: 'Artist',
            thumbnail: 'https://i.ytimg.com/vi/lyrics-copy/hqdefault.jpg',
            official: false,
          },
          {
            id: 'official-copy',
            title: 'Artist - Signal (Official Video)',
            artist: 'Artist - Topic',
            thumbnail: 'https://i.ytimg.com/vi/official-copy/hqdefault.jpg',
            official: true,
            topic: true,
          },
          {
            id: 'reaction',
            title: 'Signal reaction',
            artist: 'Random Channel',
            thumbnail: 'https://i.ytimg.com/vi/reaction/hqdefault.jpg',
            official: false,
          },
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

  await expect(page.locator('.frxe-result-title', { hasText: /^Signal$/ })).toHaveCount(1);
  await expect(page.getByText('Official', { exact: true })).toBeVisible();
  await expect(page.getByText('Artist - Topic', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Official Video/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Play Signal', exact: true }).click();
  await expect(page.locator('.frxe-mini-player')).toBeVisible();
  await page.locator('.frxe-mini-main').click();
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();
});

test('FRXE Save stores a per-browser Cobalt key without echoing it', async ({ page }) => {
  let savedKey = null;
  await page.route('**/api/cobalt-key', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) });
      return;
    }
    if (route.request().method() === 'POST') {
      savedKey = route.request().postDataJSON()?.key;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false }) });
  });

  await openSave(page);
  const input = page.getByLabel('Cobalt API key');
  await expect(input).toBeVisible();
  await input.fill('secret-per-user-key');
  await page.getByRole('button', { name: 'Save Cobalt key' }).click();

  await expect.poll(() => savedKey).toBe('secret-per-user-key');
  await expect(page.getByText('Cobalt key configured', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(page.getByText('secret-per-user-key')).toHaveCount(0);
});

test('FRXE Save uses media extraction before Cobalt', async ({ page }) => {
  let extractBody = null;
  let cobaltCalls = 0;
  await mockCobaltKeyState(page, true);
  await page.route('**/api/media-extract', async (route) => {
    extractBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ready', url: 'https://media.example/song.m4a', filename: 'song.m4a', extractor: 'innertube' }),
    });
  });
  await page.route('**/api/cobalt-download', async (route) => {
    cobaltCalls += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'should not be called' }) });
  });

  await openSave(page);
  await page.getByLabel('Media URL').fill('https://www.youtube.com/watch?v=example');
  await page.getByRole('button', { name: 'Save media' }).click();

  await expect.poll(() => extractBody).toMatchObject({
    url: 'https://www.youtube.com/watch?v=example',
    downloadMode: 'audio',
    audioFormat: 'mp3',
    videoQuality: '1080',
  });
  await expect(page.getByText(/InnerTube/i)).toBeVisible();
  expect(cobaltCalls).toBe(0);
});

test('FRXE Save uses the Cobalt bridge as fallback', async ({ page }) => {
  let cobaltBody = null;
  await mockCobaltKeyState(page, true);
  await page.route('**/api/media-extract', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'fallback', reason: 'unresolved_by_innertube_and_yt_dlp' }) });
  });
  await page.route('**/api/cobalt-download', async (route) => {
    cobaltBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'picker', items: [{ type: 'video', url: 'https://media.example/item.mp4' }] }),
    });
  });

  await openSave(page);
  await page.getByLabel('Media URL').fill('https://www.youtube.com/watch?v=example');
  await page.getByRole('button', { name: 'Save media' }).click();

  await expect.poll(() => cobaltBody).toMatchObject({ url: 'https://www.youtube.com/watch?v=example' });
  await expect(page.getByText(/Cobalt found 1 downloadable item/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /video 1/i })).toHaveAttribute('href', 'https://media.example/item.mp4');
});

test('FRXE Save surfaces provider challenge with Open source and Retry', async ({ page }) => {
  let extractCalls = 0;
  await mockCobaltKeyState(page, true);
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
      : { status: 'ready', url: 'https://media.example/after-retry.mp4', filename: 'after-retry.mp4', extractor: 'yt-dlp' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await openSave(page);
  await page.getByLabel('Media URL').fill('https://example.com/watch/1');
  await page.getByRole('button', { name: 'Save media' }).click();

  await expect(page.getByText('Please complete the CAPTCHA on the source site.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/watch/1');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => extractCalls).toBe(2);
  await expect(page.getByText(/yt-dlp/i)).toBeVisible();
});
