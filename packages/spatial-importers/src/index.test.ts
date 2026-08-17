import { describe, expect, it } from 'vitest';
import { GltfImporter } from './index.js';

function glb(json: object) {
  const data = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(data.length / 4) * 4;
  const bytes = new ArrayBuffer(20 + padded);
  const view = new DataView(bytes);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(bytes, 20).set(data);
  return bytes;
}
describe('GltfImporter', () => {
  it('derives deterministic structural identities without runtime UUIDs', async () => {
    const bytes = glb({
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
      materials: [{ name: 'A' }, { name: 'B' }],
    });
    const importer = new GltfImporter();
    const input = {
      name: 'fixture.glb',
      mimeType: 'model/gltf-binary',
      bytes,
      sha256: 'same-bytes',
    };
    const first = await importer.import(input),
      second = await importer.import(input);
    expect(first.model).toEqual(second.model);
    expect(first.model.primitives.map((item) => item.id)).toEqual([
      'primitive:0:0',
      'primitive:0:1',
    ]);
    expect(first.model.materials.map((item) => item.id)).toEqual(['material:0', 'material:1']);
  });
  it('rejects invalid GLB input', async () => {
    await expect(
      new GltfImporter().import({
        name: 'bad.glb',
        mimeType: 'model/gltf-binary',
        bytes: new ArrayBuffer(0),
        sha256: 'x',
      }),
    ).rejects.toThrow('empty');
  });
  it('keeps structure scoped to the source hash across hierarchy and shared materials', async () => {
    const bytes = glb({
      scenes: [{ nodes: [0] }],
      nodes: [{ children: [1], mesh: 0 }, { mesh: 1 }],
      meshes: [{ primitives: [{ material: 0 }] }, { primitives: [{ material: 0 }] }],
      materials: [{ name: 'Shared' }],
    });
    const importer = new GltfImporter();
    const first = await importer.import({
      name: 'a.glb',
      mimeType: 'model/gltf-binary',
      bytes,
      sha256: 'a',
    });
    const second = await importer.import({
      name: 'b.glb',
      mimeType: 'model/gltf-binary',
      bytes,
      sha256: 'b',
    });
    expect(first.model.id).not.toBe(second.model.id);
    expect(first.model.nodes[0]?.children).toEqual(['node:1']);
    expect(first.model.primitives.map((item) => item.materialId)).toEqual([
      'material:0',
      'material:0',
    ]);
  });
});
