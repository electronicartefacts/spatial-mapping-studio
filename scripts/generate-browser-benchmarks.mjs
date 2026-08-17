/* global console, TextEncoder */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sizes = [10_000, 50_000, 100_000, 250_000, 500_000];
const output = resolve('benchmarks/generated');
const pad4 = (value) => (4 - (value % 4)) % 4;

function makeGlb(triangles) {
  const cells = Math.ceil(triangles / 2);
  const columns = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / columns);
  const vertexColumns = columns + 1;
  const positions = new Float32Array((rows + 1) * vertexColumns * 3);
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const at = (row * vertexColumns + column) * 3;
      positions[at] = column / columns - 0.5;
      positions[at + 1] = row / rows - 0.5;
      positions[at + 2] = 0;
    }
  }
  const indices = new Uint32Array(triangles * 3);
  let face = 0;
  for (let row = 0; row < rows && face < triangles; row += 1) {
    for (let column = 0; column < columns && face < triangles; column += 1) {
      const a = row * vertexColumns + column;
      const b = a + 1;
      const c = a + vertexColumns;
      const d = c + 1;
      indices.set([a, b, c], face * 3);
      face += 1;
      if (face < triangles) {
        indices.set([b, d, c], face * 3);
        face += 1;
      }
    }
  }
  const positionBytes = new Uint8Array(positions.buffer);
  const indexBytes = new Uint8Array(indices.buffer);
  const bin = new Uint8Array(
    positionBytes.byteLength + pad4(positionBytes.byteLength) + indexBytes.byteLength,
  );
  bin.set(positionBytes);
  bin.set(indexBytes, positionBytes.byteLength + pad4(positionBytes.byteLength));
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'Spatial Mapping Studio benchmark fixture generator' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength + pad4(positionBytes.byteLength),
        byteLength: indexBytes.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-0.5, -0.5, 0],
        max: [0.5, 0.5, 0],
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: 'SCALAR',
        min: [0],
        max: [positions.length / 3 - 1],
      },
    ],
    materials: [
      {
        name: 'Benchmark material',
        pbrMetallicRoughness: { baseColorFactor: [0.28, 0.48, 0.92, 1] },
        doubleSided: true,
      },
    ],
    meshes: [
      {
        name: `Benchmark grid ${triangles}`,
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    nodes: [{ name: 'BenchmarkGrid', mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPadded = jsonBytes.byteLength + pad4(jsonBytes.byteLength);
  const binPadded = bin.byteLength + pad4(bin.byteLength);
  const result = new Uint8Array(12 + 8 + jsonPadded + 8 + binPadded);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.set(jsonBytes, 20);
  result.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  view.setUint32(20 + jsonPadded, binPadded, true);
  view.setUint32(24 + jsonPadded, 0x004e4942, true);
  result.set(bin, 28 + jsonPadded);
  return result;
}

await mkdir(output, { recursive: true });
for (const triangles of sizes) {
  const bytes = makeGlb(triangles);
  const filename = `grid-${triangles}.glb`;
  await writeFile(resolve(output, filename), bytes);
  console.log(`${filename}: ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MiB`);
}
