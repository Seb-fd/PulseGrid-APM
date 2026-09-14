import { test, expect } from '@playwright/test';

/**
 * Delta 008 E2E: live Wikimedia telemetry.
 * Delta 009: the global status indicator is a compact header pill
 * (desktop compact text + mobile truncated text); the full connected
 * string lives in the dashboard overview line + pill aria-label/title.
 * Hermetic: the live case mocks the Wikimedia WebSocket with `routeWebSocket`
 * (never hits the real stream); the fallback case forces the simulator via a
 * dead-port `liveUrl` (existing seam).
 */

const WIKI_PATTERN = '**/stream.wikimedia.org/v2/stream/recentchange';
const DEAD = 'ws://127.0.0.1:9/dead';
const FULL_LABEL = 'Connected to Wikimedia Global Event Stream';

function recentChange(title: string, user: string, dt: string): string {
  return JSON.stringify({
    $schema: '/mediawiki/recentchange/1.0.0',
    meta: {
      uri: `https://en.wikipedia.org/wiki/${title}`,
      dt,
      domain: 'en.wikipedia.org',
      stream: 'mediawiki.recentchange',
      topic: 'eqiad.mediawiki.recentchange',
      partition: 0,
      offset: 1,
    },
    id: 1,
    type: 'edit',
    namespace: 0,
    title,
    title_url: `https://en.wikipedia.org/wiki/${title}`,
    comment: 'e2e test edit',
    timestamp: Math.floor(new Date(dt).getTime() / 1000),
    user,
    bot: false,
    minor: false,
    patrolled: true,
    length: { old: 1000, new: 1010 },
    revision: { old: 1, new: 2 },
    server_url: 'https://en.wikipedia.org',
    server_name: 'en.wikipedia.org',
    wiki: 'enwiki',
    parsedcomment: 'e2e test edit',
  });
}

async function mockWikimediaStream(page: import('@playwright/test').Page): Promise<void> {
  await page.routeWebSocket(WIKI_PATTERN, (route) => {
    const push = (title: string, user: string): void => {
      route.send(recentChange(title, user, new Date().toISOString()));
    };
    push('Albert_Einstein', 'Alice');
    push('Paris', 'Bob');
    const timer = setInterval(() => {
      push('Live_Page', 'Carol');
    }, 500);
    route.onClose(() => {
      clearInterval(timer);
    });
  });
}

test.describe('GIVEN the live Wikimedia stream (mocked WebSocket)', () => {
  test('WHEN mocked edits flow THEN the dashboard shows the Wikimedia connected status', async ({
    page,
  }) => {
    await mockWikimediaStream(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dashboard-live-status')).toContainText(
      'Live Status: Connected to Wikimedia Global Event Stream',
      { timeout: 30_000 },
    );
    const pill = page.getByTestId('status-pill');
    await expect(pill).toContainText('Live: Wikimedia EventStreams');
    await expect(pill).toHaveAttribute('aria-label', FULL_LABEL);
    await expect(pill).toHaveAttribute('title', FULL_LABEL);
    await expect(page.getByTestId('app-footer')).toBeVisible();
    await expect(page.getByTestId('app-footer')).toContainText(
      'Metrics and telemetry derived from the live Wikimedia EventStreams feed',
    );
    await expect(
      page.getByText(/Metrics and telemetry derived from the live Wikimedia/),
    ).toHaveCount(1);
  });

  test('WHEN mocked edits flow THEN telemetry charts and live log rows render', async ({
    page,
  }) => {
    await mockWikimediaStream(page);
    await page.goto('/telemetry');
    for (const testId of ['chart-cpu', 'chart-memory', 'chart-latency', 'chart-throughput']) {
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByTestId('app-footer')).toBeVisible();
    await expect(page.getByTestId('app-footer')).toContainText(
      'Metrics and telemetry derived from the live Wikimedia EventStreams feed',
    );
    await expect(
      page.getByText(/Metrics and telemetry derived from the live Wikimedia/),
    ).toHaveCount(1);
    await page.goto('/logs');
    await expect(page.getByTestId('log-count')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\/wiki\//).first()).toBeVisible({ timeout: 30_000 });
  });

  test('WHEN viewed on a mobile viewport THEN the pill truncates with full title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockWikimediaStream(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    const pill = page.getByTestId('status-pill');
    await expect(pill).toContainText('LIVE', { timeout: 30_000 });
    await expect(pill).toHaveAttribute('title', FULL_LABEL);
    await expect(pill).toHaveAttribute('aria-label', FULL_LABEL);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('WHEN the hamburger opens across mobile widths THEN the drawer shows 44px links with no page overflow (LIVE)', async ({
    page,
  }) => {
    const widths = [320, 360, 375, 414];
    const links = ['Dashboard', 'Telemetry', 'Logs', 'Topology', 'Alerts'];
    await mockWikimediaStream(page);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 667 });
      await page.goto('/dashboard');
      await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('status-pill')).toContainText('LIVE', { timeout: 30_000 });
      const toggle = page.getByRole('button', { name: 'Toggle navigation menu' });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      const nav = page.getByTestId('primary-nav');
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav).toBeVisible();
      // Drawer stacks vertically (not the former horizontal scroller).
      const direction = await nav.evaluate((el) => getComputedStyle(el).flexDirection);
      expect(direction).toBe('column');
      // Zero horizontal page overflow with the drawer open.
      const overflow = await page.evaluate(() => {
        const header = document.querySelector('header');
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          header: (header?.getBoundingClientRect().width ?? 0) - window.innerWidth,
        };
      });
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.header).toBeLessThanOrEqual(1);
      // Every drawer link is a full-width row (of the padded panel) meeting
      // the 44px touch-target bar.
      const navBox = await nav.boundingBox();
      for (const name of links) {
        const link = nav.getByRole('link', { name });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeCloseTo((navBox?.width ?? 0) - 32, 0);
      }
      // Click-to-close: following a link collapses the drawer.
      await nav.getByRole('link', { name: 'Telemetry' }).click();
      await expect(page).toHaveURL(/\/telemetry/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav).toBeHidden();
    }
  });

  test('WHEN viewed on a desktop viewport THEN the inline nav shows with no toggle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockWikimediaStream(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Toggle navigation menu' })).toBeHidden();
    const nav = page.getByTestId('primary-nav');
    await expect(nav).toBeVisible();
    for (const name of ['Dashboard', 'Telemetry', 'Logs', 'Topology', 'Alerts']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
  });

  test('WHEN the drawer opens at page top and mid-scroll THEN it overlays with zero layout shift', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockWikimediaStream(page);
    await page.goto('/dashboard');
    const board = page.getByTestId('dashboard-board');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('status-pill')).toContainText('LIVE', { timeout: 30_000 });
    const toggle = page.getByRole('button', { name: 'Toggle navigation menu' });
    const nav = page.getByTestId('primary-nav');
    const header = page.locator('header');

    // At scrollTop = 0 the drawer must float above content, not push it down.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    const topY = (await board.boundingBox())?.y ?? 0;
    const topScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await toggle.click();
    await expect(nav).toBeVisible();
    expect((await board.boundingBox())?.y ?? -1).toBeCloseTo(topY, 0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(topScrollHeight);
    // Overlay geometry: absolute, docked to the header bottom (tucking 1px
    // under its border), full-bleed.
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    const headerBox = await header.boundingBox();
    const navBox = await nav.boundingBox();
    const headerBottom = (headerBox?.y ?? 0) + (headerBox?.height ?? 0);
    expect(navBox?.y ?? -1).toBeGreaterThanOrEqual(headerBottom - 1);
    expect(navBox?.y ?? 0).toBeLessThanOrEqual(headerBottom);
    expect(navBox?.width ?? 0).toBeCloseTo(375, 0);
    await toggle.click();
    await expect(nav).toBeHidden();

    // Mid-scroll parity: opening moves neither the content nor the viewport.
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    const midY = (await board.boundingBox())?.y ?? 0;
    await toggle.click();
    await expect(nav).toBeVisible();
    expect((await board.boundingBox())?.y ?? -1).toBeCloseTo(midY, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(500);
  });
});

test.describe('GIVEN an unreachable live stream (dead port)', () => {
  test('WHEN opened THEN the app falls back to SIMULATED with retry available', async ({
    page,
  }) => {
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry Live' })).toBeVisible();
  });

  test('WHEN the hamburger opens across mobile widths THEN the drawer holds with no page overflow (SIMULATED)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const widths = [320, 360, 375, 414];
    const links = ['Dashboard', 'Telemetry', 'Logs', 'Topology', 'Alerts'];
    // Single load: the dead-port failover (WS retries + SSE fallback derived
    // from liveUrl) takes several seconds — settling once, then resizing
    // across widths without reloads (resize never reopens the drawer).
    await page.setViewportSize({ width: 320, height: 667 });
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry Live' })).toBeVisible();
    const toggle = page.getByRole('button', { name: 'Toggle navigation menu' });
    const nav = page.getByTestId('primary-nav');
    for (const [index, width] of widths.entries()) {
      await page.setViewportSize({ width, height: 667 });
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav).toBeVisible();
      const overflow = await page.evaluate(() => {
        const header = document.querySelector('header');
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          header: (header?.getBoundingClientRect().width ?? 0) - window.innerWidth,
        };
      });
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.header).toBeLessThanOrEqual(1);
      for (const name of links) {
        const link = nav.getByRole('link', { name });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      if (index === widths.length - 1) {
        // Click-to-close on the final width (follows the link away).
        await nav.getByRole('link', { name: 'Logs' }).click();
        await expect(page).toHaveURL(/\/logs/);
      } else {
        await toggle.click();
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav).toBeHidden();
    }
  });
});

test.describe('GIVEN a failed stream WHEN Retry Live is clicked', () => {
  test('WHEN retry targets a still-dead stream THEN it falls back to SIMULATED (never stuck RECONNECTING)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Retry Live' }).click();
    // Regression guard for the stuck-`Reconnecting…` bug: the 5s handshake
    // guard must resolve to SIMULATED with an error, never hang.
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry Live' })).toBeVisible();
  });

  test('WHEN retry targets a recovered live stream THEN it recovers to LIVE', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 30_000 });
    // Recover: point the dynamic liveUrl seam back at the (mocked) live
    // endpoint, then retry. retryLiveConnection() re-reads location.search.
    await mockWikimediaStream(page);
    await page.evaluate(() => {
      window.history.replaceState(null, '', '/dashboard');
    });
    await page.getByRole('button', { name: 'Retry Live' }).click();
    const pill = page.getByTestId('status-pill');
    await expect(pill).toContainText('Live: Wikimedia EventStreams', { timeout: 30_000 });
    await expect(pill).toHaveAttribute('aria-label', FULL_LABEL);
    await expect(page.getByTestId('dashboard-live-status')).toContainText(
      'Live Status: Connected to Wikimedia Global Event Stream',
      { timeout: 30_000 },
    );
  });

  test('WHEN retry targets a hung stream THEN the 5s handshake guard falls back to SIMULATED', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Hung handshake: accept the socket but never send, close, or error.
    await page.routeWebSocket('**/127.0.0.1:9/dead', () => {
      // Intentionally silent — the 5s first-frame guard must fail fast.
    });
    await page.goto(`/dashboard?liveUrl=${DEAD}`);
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Retry Live' }).click();
    await expect(page.getByRole('status')).toContainText('SIMULATED', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Retry Live' })).toBeVisible();
  });
});
