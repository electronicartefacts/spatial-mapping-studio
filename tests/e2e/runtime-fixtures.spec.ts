import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
  resolve(import.meta.dirname, `../../examples/runtime-fixtures/${name}`);

test('canonical Primitive and shared Material modes operate on real GLB fixtures', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#glb-input').setInputFiles(fixture('multi-primitive.glb'));
  await expect(page.locator('#status')).toContainText('SHA-256 fingerprint attached');
  await expect(page.locator('#model-summary')).toContainText('2 primitives');
  const canvas = page.locator('#viewport canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const clickModel = async () => {
    for (const x of [0.25, 0.35, 0.5, 0.65, 0.75])
      for (const y of [0.25, 0.35, 0.5, 0.65, 0.75]) {
        await page.mouse.click(box!.x + box!.width * x, box!.y + box!.height * y);
        if ((await page.locator('#selection-count').textContent()) !== '0 selected faces') return;
      }
  };
  await page.getByRole('button', { name: 'Primitive' }).click();
  await clickModel();
  await expect(page.locator('#selection-count')).toHaveText('1 selected faces');
  await page.locator('#glb-input').setInputFiles(fixture('shared-material.glb'));
  await expect(page.locator('#status')).toContainText('SHA-256 fingerprint attached');
  await page.getByRole('button', { name: 'Material' }).click();
  await clickModel();
  await expect(page.locator('#selection-count')).toHaveText('2 selected faces');
});
