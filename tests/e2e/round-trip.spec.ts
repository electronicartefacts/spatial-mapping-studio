import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseSpatialArtefact } from '../../packages/spatial-artefact-schema/src/index.js';

const fixture = resolve(import.meta.dirname, '../../apps/demo-vanilla/public/artifact/model.glb');

test('Mapper export round-trips through Spatial Viewer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.locator('#glb-input').setInputFiles(fixture);
  await expect(page.locator('#status')).toContainText('SHA-256 fingerprint attached');
  const canvas = page.locator('#viewport canvas'),
    box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  selectFace: for (const x of [0.3, 0.4, 0.5, 0.6, 0.7])
    for (const y of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      await page.mouse.click(box!.x + box!.width * x, box!.y + box!.height * y);
      if ((await page.locator('#selection-count').textContent()) !== '0 selected faces')
        break selectFace;
    }
  await expect(page.locator('#selection-count')).not.toHaveText('0 selected faces');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#selection-count')).toHaveText('0 selected faces');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#selection-count')).not.toHaveText('0 selected faces');
  await page.locator('#region-id').fill('round-trip-face');
  await page.locator('#region-label').fill('Round-trip face');
  await page.locator('#region-tags').fill('fixture, verified');
  await page.getByRole('button', { name: 'Save region' }).click();
  await expect(page.locator('#regions')).toContainText('Round-trip face');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#regions')).not.toContainText('Round-trip face');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#regions')).toContainText('Round-trip face');
  await page
    .getByRole('button', { name: /Round-trip face/ })
    .first()
    .click();
  await page.locator('#edit-region-label').fill('Renamed face');
  await page.locator('#edit-region-label').press('Enter');
  await expect(page.locator('#regions')).toContainText('Renamed face');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#regions')).toContainText('Round-trip face');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#regions')).toContainText('Renamed face');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export artifact.json' }).click();
  const download = await promise;
  const manifest = parseSpatialArtefact(
    JSON.parse(await readFile((await download.path())!, 'utf8')),
  );
  expect(manifest.payload.integrity).toEqual({
    algorithm: 'sha256',
    hash: createHash('sha256')
      .update(await readFile(fixture))
      .digest('hex'),
  });
  expect(manifest).toMatchObject({
    artifact: 'spatial',
    specVersion: '0.1.0',
    regions: [
      {
        id: 'round-trip-face',
        label: 'Renamed face',
        tags: ['fixture', 'verified'],
        selector: { type: 'triangles', mesh: 'Mesh_0' },
      },
    ],
  });
  await page.route('**/artifact/artifact.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) }),
  );
  await page.goto('http://127.0.0.1:4184/');
  const viewerCanvas = page.locator('#viewer canvas');
  await expect(viewerCanvas).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const v = document.querySelector('#viewer');
    v?.addEventListener('region-enter', (e) => {
      window.__spatialRegionEvent = e.detail.id;
    });
    v?.addEventListener('region-select', (e) => {
      window.__spatialRegionSelected = e.detail.id;
    });
  });
  const viewBox = await viewerCanvas.boundingBox();
  expect(viewBox).not.toBeNull();
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8])
    for (const y of [0.2, 0.35, 0.5, 0.65, 0.8])
      await page.mouse.move(viewBox!.x + viewBox!.width * x, viewBox!.y + viewBox!.height * y);
  await expect.poll(() => page.evaluate(() => window.__spatialRegionEvent)).toBe('round-trip-face');
  await expect(viewerCanvas).toBeVisible();
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8])
    for (const y of [0.2, 0.35, 0.5, 0.65, 0.8])
      await page.mouse.click(viewBox!.x + viewBox!.width * x, viewBox!.y + viewBox!.height * y);
  await expect
    .poll(() => page.evaluate(() => window.__spatialRegionSelected))
    .toBe('round-trip-face');
});
