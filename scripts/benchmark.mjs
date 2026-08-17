/* global console */
import { performance } from 'node:perf_hooks';
import {
  compileSpatialArtefact,
  createWorkspaceProject,
  createTopologyIndex,
} from '../packages/spatial-project-core/dist/index.js';

const percentile = (values, value) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * value)] ?? 0;
};
const stats = (values) => ({
  medianMs: Number(percentile(values, 0.5).toFixed(2)),
  p95Ms: Number(percentile(values, 0.95).toFixed(2)),
});
const grid = (triangles) => {
  const cells = Math.ceil(triangles / 2);
  const width = Math.ceil(Math.sqrt(cells));
  const output = [];
  for (let cell = 0; output.length < triangles; cell += 1) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const a = `${x}:${y}`;
    const b = `${x + 1}:${y}`;
    const c = `${x}:${y + 1}`;
    const d = `${x + 1}:${y + 1}`;
    output.push([a, b, c]);
    if (output.length < triangles) output.push([b, d, c]);
  }
  return output;
};
const measure = (run, repetitions = 5) => {
  const values = [];
  for (let attempt = 0; attempt < repetitions; attempt += 1) {
    const started = performance.now();
    run();
    values.push(performance.now() - started);
  }
  return stats(values);
};

const topology = [];
for (const triangles of [10_000, 50_000, 100_000, 250_000, 500_000]) {
  const source = grid(triangles);
  topology.push({ triangles, topology: measure(() => createTopologyIndex(source), 3) });
}
const selectorScaling = [];
for (const faces of [1_000, 10_000, 50_000, 100_000]) {
  const project = createWorkspaceProject({
    name: 'benchmark.glb',
    format: 'glb',
    mimeType: 'model/gltf-binary',
    integrity: { algorithm: 'sha256', hash: '0'.repeat(64) },
  });
  project.regions.push({
    id: `faces-${faces}`,
    label: `${faces} faces`,
    tags: ['benchmark'],
    selector: {
      type: 'triangles',
      mesh: 'BenchmarkGrid',
      faces: Array.from({ length: faces }, (_, index) => index),
    },
  });
  const manifest = compileSpatialArtefact(project);
  const json = JSON.stringify(manifest);
  selectorScaling.push({
    faces,
    bytes: Buffer.byteLength(json),
    serialization: measure(() => JSON.stringify(manifest), 7),
  });
}
console.table(
  topology.map((item) => ({
    triangles: item.triangles,
    topologyMedianMs: item.topology.medianMs,
    topologyP95Ms: item.topology.p95Ms,
  })),
);
console.table(
  selectorScaling.map((item) => ({
    faces: item.faces,
    bytes: item.bytes,
    serializationMedianMs: item.serialization.medianMs,
    serializationP95Ms: item.serialization.p95Ms,
  })),
);
console.log(JSON.stringify({ kind: 'node-scaling', topology, selectorScaling }));
