import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';

// A 24-vertex cube: each face has independent normals/vertices, 12 stable triangles.
const positions = new Float32Array([
  1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, 1, -1, -1,
  1, 1, 1, 1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1,
  -1, 1, 1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1,
]);
const indices = new Uint16Array(
  Array.from({ length: 6 }, (_, side) =>
    [0, 1, 2, 0, 2, 3].map((index) => index + side * 4),
  ).flat(),
);
const binary = Buffer.alloc(positions.byteLength + indices.byteLength);
Buffer.from(positions.buffer).copy(binary, 0);
Buffer.from(indices.buffer).copy(binary, positions.byteLength);
const json = {
  asset: { version: '2.0', generator: 'Spatial Mapping Studio fixture generator' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Mesh_0' }],
  meshes: [
    { name: 'Mesh_0', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
  ],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.16, 0.35, 0.85, 1],
        metallicFactor: 0.15,
        roughnessFactor: 0.48,
      },
    },
  ],
  buffers: [{ byteLength: binary.byteLength }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
    { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
};
const pad = (buffer) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, 0x20)]);
const jsonBuffer = pad(Buffer.from(JSON.stringify(json)));
const binaryBuffer = pad(binary);
const glb = Buffer.alloc(12 + 8 + jsonBuffer.length + 8 + binaryBuffer.length);
let offset = 0;
glb.writeUInt32LE(0x46546c67, offset);
offset += 4;
glb.writeUInt32LE(2, offset);
offset += 4;
glb.writeUInt32LE(glb.length, offset);
offset += 4;
glb.writeUInt32LE(jsonBuffer.length, offset);
offset += 4;
glb.writeUInt32LE(0x4e4f534a, offset);
offset += 4;
jsonBuffer.copy(glb, offset);
offset += jsonBuffer.length;
glb.writeUInt32LE(binaryBuffer.length, offset);
offset += 4;
glb.writeUInt32LE(0x004e4942, offset);
offset += 4;
binaryBuffer.copy(glb, offset);
mkdirSync('apps/demo-vanilla/public/artifact', { recursive: true });
mkdirSync('examples/mapped-object', { recursive: true });
writeFileSync('apps/demo-vanilla/public/artifact/model.glb', glb);
copyFileSync('apps/demo-vanilla/public/artifact/model.glb', 'examples/mapped-object/model.glb');
mkdirSync('examples/conformance', { recursive: true });
copyFileSync('apps/demo-vanilla/public/artifact/model.glb', 'examples/conformance/model.glb');
