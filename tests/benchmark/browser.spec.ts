/* global console */
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const percentile = (values: number[], value: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * value)] ?? 0;
};
const distribution = (values: number[]) => ({
  median: Number(percentile(values, 0.5).toFixed(2)),
  p95: Number(percentile(values, 0.95).toFixed(2)),
});
const sizes = process.env.BENCHMARK_FULL
  ? [10_000, 50_000, 100_000, 250_000, 500_000]
  : [10_000, 100_000, 500_000];
const fileFor = (triangles: number) => resolve(`benchmarks/generated/grid-${triangles}.glb`);

async function load(page: import('@playwright/test').Page, triangles: number) {
  await page.goto('/');
  const started = performance.now();
  await page.locator('#glb-input').setInputFiles(fileFor(triangles));
  await expect(page.locator('#status')).toContainText('SHA-256 fingerprint attached', {
    timeout: 120_000,
  });
  const ttiMs = performance.now() - started;
  const metrics = await page.evaluate(() => {
    const state = window as Window & {
      __spatialBenchmark?: { load?: Record<string, number> };
    };
    return state.__spatialBenchmark?.load ?? {};
  });
  return { ttiMs, ...metrics };
}

async function boxFor(page: import('@playwright/test').Page) {
  const box = await page.locator('#viewport canvas').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test('production desktop: cold load, raycast, overlay and brush matrix', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.addInitScript(() => {
    const state = window as Window & { __studioLongTasks?: number[] };
    state.__studioLongTasks = [];
    new PerformanceObserver((entries) => {
      state.__studioLongTasks?.push(...entries.getEntries().map((entry) => entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  });
  const report: Record<string, unknown>[] = [];
  for (const triangles of sizes) {
    const loads: Record<string, number>[] = [];
    for (let run = 0; run < 3; run += 1) loads.push(await load(page, triangles));
    const names = [
      'ttiMs',
      'fileReadMs',
      'canonicalImportMs',
      'gltfParseMs',
      'runtimeMappingMs',
      'topologyMs',
    ];
    const row: Record<string, unknown> = { triangles, coldLoad: {} };
    for (const name of names) {
      const values = loads
        .map((item) => item[name])
        .filter((item): item is number => typeof item === 'number');
      (row.coldLoad as Record<string, unknown>)[name] = distribution(values);
    }
    await load(page, triangles);
    const box = await boxFor(page);
    const raycast: number[] = [];
    for (let run = 0; run < 9; run += 1) {
      await page.mouse.click(
        box.x + box.width * (0.35 + (run % 3) * 0.12),
        box.y + box.height * 0.5,
      );
      raycast.push(
        await page.evaluate(
          () =>
            (window as Window & { __spatialBenchmark?: { raycastMs?: number } }).__spatialBenchmark
              ?.raycastMs ?? 0,
        ),
      );
    }
    const overlays = [];
    for (const faces of [10, 100, 1_000, 10_000, 50_000, 100_000]) {
      const elapsed = await page.evaluate(
        (faceCount) =>
          (
            window as Window & { __spatialBenchmarkMeasureOverlay?: (count: number) => number }
          ).__spatialBenchmarkMeasureOverlay?.(faceCount) ?? 0,
        faces,
      );
      overlays.push({ faces, rebuildMs: Number(elapsed.toFixed(2)) });
    }
    row.warm = { raycast: distribution(raycast), overlays };
    report.push(row);
  }
  const brushReport: Record<string, unknown>[] = [];
  for (const triangles of [10_000, 100_000, 500_000]) {
    await load(page, triangles);
    const box = await boxFor(page);
    for (const radius of [16, 36, 72, 120]) {
      const samples: number[] = [];
      for (let run = 0; run < 4; run += 1) {
        await page.evaluate(
          ({ x, y, brushRadius }) =>
            (
              window as Window & {
                __spatialBenchmarkMeasureBrush?: (x: number, y: number, radius: number) => number;
              }
            ).__spatialBenchmarkMeasureBrush?.(x, y, brushRadius),
          { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5, brushRadius: radius },
        );
        samples.push(
          await page.evaluate(
            () =>
              (window as Window & { __spatialBenchmark?: { brushMs?: number } }).__spatialBenchmark
                ?.brushMs ?? 0,
          ),
        );
      }
      brushReport.push({ triangles, radius, candidateScan: distribution(samples) });
    }
  }
  const longTasks = await page.evaluate(
    () => (window as Window & { __studioLongTasks?: number[] }).__studioLongTasks ?? [],
  );
  console.log(
    JSON.stringify({
      kind: 'desktop-production',
      report,
      brushReport,
      longTasks: distribution(longTasks),
    }),
  );
});

test('production mobile: small and medium cold load', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const report: Record<string, unknown>[] = [];
  for (const triangles of [10_000, 100_000]) {
    const runs: Record<string, number>[] = [];
    for (let run = 0; run < 3; run += 1) runs.push(await load(page, triangles));
    report.push({
      triangles,
      ttiMs: distribution(runs.map((item) => item.ttiMs)),
      topologyMs: distribution(runs.map((item) => item.topologyMs)),
    });
  }
  console.log(JSON.stringify({ kind: 'mobile-production-emulation', report }));
  await context.close();
});
