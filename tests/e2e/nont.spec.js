import { expect, test } from '@playwright/test';

function repoPayload(repo) {
  const versions = {
    'voidnont/NontHub': '0.4.4',
    'voidnont/NontMusic': '0.4.2',
    'voidnont/veilbrowser': '0.8.0',
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

async function mockHubApis(page) {
  await page.route('**/api/github-sync?repo=*', async (route) => {
    const url = new URL(route.request().url());
    const repo = url.searchParams.get('repo') || 'voidnont/NontHub';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(repoPayload(repo)) });
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
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(nav).toContainText(['Home', 'Search', 'Save', 'Library', 'Settings']);

  await nav.getByRole('button', { name: 'Search' }).click();
  const search = page.getByRole('textbox', { name: 'Search Frxe' });
  await search.fill('Artist Signal');
  await page.getByRole('button', { name: 'Search music' }).click();

  await expect(page.locator('.frxe-result-title', { hasText: /^Signal$/ })).toHaveCount(1);
  await expect(page.getByText('Official', { exact: true })).toBeVisible();
  await expect(page.getByText('Artist - Topic', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Official Video/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Play Signal' }).click();
  await expect(page.locator('.frxe-mini-player')).toBeVisible();
  await page.locator('.frxe-mini-main').click();
  await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();
});
