import { expect, test } from '@playwright/test';
test('mapped artefact displays and exposes semantic regions', async ({ page }) => {
  await page.goto('http://127.0.0.1:4184/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: /Front surface/ })).toBeVisible();

  await page.evaluate(() => {
    const viewer = document.querySelector('#viewer');
    viewer?.addEventListener('region-enter', (event) => {
      window.__spatialRegionEvent = event.detail.id;
    });
  });
  await page.waitForTimeout(750);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const y of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      await page.mouse.move(box!.x + box!.width * x, box!.y + box!.height * y);
    }
  }
  await expect.poll(() => page.evaluate(() => window.__spatialRegionEvent)).toMatch(/front|top/);

  await page.getByRole('button', { name: /Front surface/ }).click();
  await expect(page.locator('#detail')).toContainText('Front surface');
});
