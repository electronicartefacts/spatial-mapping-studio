/* global console */
import { expect, test } from '@playwright/test';

const percentile = (values: number[], value: number) =>
  values[Math.floor((values.length - 1) * value)] ?? 0;

test('browser Studio benchmark', async ({ page }) => {
  const started = performance.now();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try example' }).click();
  await expect(page.locator('#status')).toContainText('SHA-256 fingerprint attached');
  const tti = performance.now() - started;
  const canvas = page.locator('#viewport canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const samples: number[] = [];
  for (const x of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const start = performance.now();
    await page.mouse.move(box!.x + box!.width * x, box!.y + box!.height * 0.5);
    samples.push(performance.now() - start);
  }
  await page.getByRole('button', { name: 'Primitive' }).click();
  const selectStart = performance.now();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await expect(page.locator('#selection-count')).not.toHaveText('0 selected faces');
  const selection = performance.now() - selectStart;
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByRole('button', { name: 'Brush' }).click();
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.52, box!.y + box!.height * 0.52);
  await page.mouse.up();
  await expect(page.locator('#selection-count')).not.toHaveText('0 selected faces');
  const brushCount = await page.locator('#selection-count').innerText();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#selection-count')).toHaveText('0 selected faces');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#selection-count')).toHaveText(brushCount);
  console.log(
    JSON.stringify({
      model: 'shared-material.glb',
      ttiMs: Number(tti.toFixed(2)),
      pointerMoveMedianMs: Number(
        percentile(
          samples.sort((a, b) => a - b),
          0.5,
        ).toFixed(2),
      ),
      pointerMoveP95Ms: Number(percentile(samples, 0.95).toFixed(2)),
      selectionMs: Number(selection.toFixed(2)),
      brush: brushCount,
    }),
  );
});
