/* global console */
import { performance } from 'node:perf_hooks';
import {
  connectedComponent,
  createTopologyIndex,
  growSelection,
  shrinkSelection,
} from '../packages/spatial-project-core/dist/topology.js';

const measure = (name, run) => {
  const start = performance.now();
  const value = run();
  return { name, ms: Number((performance.now() - start).toFixed(2)), value };
};
const grid = (triangles) => {
  const cells = Math.ceil(triangles / 2);
  const width = Math.ceil(Math.sqrt(cells));
  const output = [];
  for (let cell = 0; output.length < triangles; cell += 1) {
    const x = cell % width,
      y = Math.floor(cell / width),
      a = `${x}:${y}`,
      b = `${x + 1}:${y}`,
      c = `${x}:${y + 1}`,
      d = `${x + 1}:${y + 1}`;
    output.push([a, b, c]);
    if (output.length < triangles) output.push([b, d, c]);
  }
  return output;
};
const report = [];
for (const size of [10_000, 50_000, 100_000]) {
  const built = measure('topology build', () => createTopologyIndex(grid(size)));
  const index = built.value;
  const connected = measure('connected', () => connectedComponent(index, 0));
  const grow = measure('grow', () => growSelection(index, [0]));
  const shrink = measure('shrink', () => shrinkSelection(index, connected.value));
  report.push({
    triangles: size,
    topologyMs: built.ms,
    connectedMs: connected.ms,
    growMs: grow.ms,
    shrinkMs: shrink.ms,
  });
}
console.table(report);
console.log(JSON.stringify(report));
