import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, '../examples/runtime-fixtures');
const publicOutput = resolve(import.meta.dirname, '../apps/mapper/public/examples');
const pad = (buffer, alignment = 4, value = 0) =>
  Buffer.concat([
    buffer,
    Buffer.alloc((alignment - (buffer.length % alignment)) % alignment, value),
  ]);
const view = (values, type) => Buffer.from(new type(values).buffer);
const fixture = async (name, primitiveMaterials) => {
  const positions = view([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], Float32Array);
  const indices = primitiveMaterials.map((_, index) =>
    view(index ? [1, 3, 2] : [0, 1, 2], Uint16Array),
  );
  let binary = positions;
  const bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 }];
  const accessors = [
    { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
  ];
  for (const index of indices) {
    binary = pad(binary);
    bufferViews.push({
      buffer: 0,
      byteOffset: binary.length,
      byteLength: index.length,
      target: 34963,
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123,
      count: 3,
      type: 'SCALAR',
    });
    binary = Buffer.concat([binary, index]);
  }
  binary = pad(binary);
  const json = pad(
    Buffer.from(
      JSON.stringify({
        asset: { version: '2.0', generator: 'Spatial Mapping Studio fixture generator' },
        buffers: [{ byteLength: binary.length }],
        bufferViews,
        accessors,
        materials: [...new Set(primitiveMaterials)].map((material) => ({
          name: `Material ${material}`,
        })),
        meshes: [
          {
            name: 'FixtureMesh',
            primitives: primitiveMaterials.map((material, index) => ({
              attributes: { POSITION: 0 },
              indices: index + 1,
              material,
            })),
          },
        ],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
      }),
    ),
    4,
    0x20,
  );
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + 8 + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([header, json, binHeader, binary]);
  await writeFile(resolve(output, name), bytes);
  await writeFile(resolve(publicOutput, name), bytes);
};
await mkdir(output, { recursive: true });
await mkdir(publicOutput, { recursive: true });
await fixture('multi-primitive.glb', [0, 1]);
await fixture('shared-material.glb', [0, 0]);
