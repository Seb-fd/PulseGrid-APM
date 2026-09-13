import { test, expect } from '@playwright/test';

/**
 * Delta 003b E2E: dashboard DnD + persist, alert rule fires on sim breach,
 * topology outage turns nodes red. Hermetic: dead-port WS forces sim fallback.
 */
const DEAD = 'ws://127.0.0.1:9/dead';

async function widgetOrder(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="widget-"]')).map((el) =>
      (el.getAttribute('data-testid') ?? '').replace('widget-', ''),
    ),
  );
}

test.describe('GIVEN the dashboard grid', () => {
  test('WHEN latency moves above cpu THEN order changes AND reload restores it', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('widget-cpu')).toBeVisible();
    const before = await widgetOrder(page);

    // Strict reorder via the keyboard fallback (same layout signal as the drop path).
    for (let i = 0; i < 7; i++) {
      const first = await page.evaluate(() =>
        document
          .querySelector('[data-testid="dashboard-board"] > section')
          ?.getAttribute('data-testid'),
      );
      if (first === 'widget-latency') break;
      await page.getByTestId('move-latency-up').click();
    }
    let order = await widgetOrder(page);
    expect(order[0]).toBe('latency');
    expect(order).not.toEqual(before);

    // Real pointer drag through the CDK handle (exercises the drop path);
    // the persist effect must keep storage consistent with the DOM either way.
    await page.getByTestId('drag-incidents').dragTo(page.getByTestId('widget-cpu'));
    await page.waitForTimeout(500);
    order = await widgetOrder(page);

    // localStorage snapshot matches the DOM order.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('pg.dashboard.layout.v1') ?? '{}';
      return (JSON.parse(raw) as { widgets: { id: string }[] }).widgets.map((w) => w.id);
    });
    expect(stored.slice(0, order.length)).toEqual(order);

    await page.reload();
    await expect(page.getByTestId('dashboard-board')).toBeVisible({ timeout: 30_000 });
    expect(await widgetOrder(page)).toEqual(order);

    // Reset restores the catalogue default.
    await page.getByTestId('dashboard-reset').click();
    await expect
      .poll(async () => widgetOrder(page), { timeout: 10_000 })
      .toEqual(['cpu', 'memory', 'latency', 'throughput', 'logs', 'topology', 'incidents']);
  });

  test('WHEN topology is hidden THEN it disappears AND show restores it', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('widget-topology')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('hide-topology').click();
    await expect(page.getByTestId('widget-topology')).toHaveCount(0);
    await page.getByTestId('show-topology').click();
    await expect(page.getByTestId('widget-topology')).toBeVisible();
  });
});

test.describe('GIVEN the alerts page in latency-burst sim mode', () => {
  test('WHEN a sustained-breach rule is created THEN an incident fires', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/alerts?liveUrl=${DEAD}&scenario=latency-burst`);
    await expect(page.getByTestId('rule-save')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('rule-name').fill('E2E Latency');
    await page.getByTestId('rule-threshold').fill('200');
    await page.getByTestId('rule-duration').fill('5');
    await expect(page.getByTestId('rule-save')).toBeEnabled();
    await page.getByTestId('rule-save').click();
    await expect(page.getByTestId('rule-list')).toContainText('E2E Latency');

    // ~7s WS fallback + 5s sustained window + 1s tick → poll generously.
    await expect(page.getByTestId('incident-banner')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('incident-count')).toContainText('1 firing');
  });
});

test.describe('GIVEN the topology map in outage sim mode', () => {
  test('WHEN outage streams THEN a node turns red AND click opens detail', async ({ page }) => {
    await page.goto(`/topology?liveUrl=${DEAD}&scenario=outage`);
    await expect(page.getByTestId('topology-svg')).toBeVisible({ timeout: 30_000 });

    const down = page.locator('circle[fill="#ef4444"]');
    await expect.poll(async () => down.count(), { timeout: 45_000 }).toBeGreaterThan(0);

    await page.getByTestId('node-ledger').click();
    await expect(page.getByTestId('topology-detail')).toContainText('Ledger');
    await expect(page.getByTestId('topology-health')).toContainText(/degraded|down/);
  });
});
