import { describe, expect, it } from 'vitest';
import { safeParseSpatialArtefact } from './index.js';

const valid = {
  artifact: 'spatial',
  specVersion: '0.1.0',
  metadata: { id: 'hammer-001', title: 'Hammer' },
  payload: { type: 'model/gltf-binary', src: './model.glb' },
  regions: [
    {
      id: 'handle',
      label: 'Handle',
      tags: ['wood'],
      selector: { type: 'triangles', mesh: 'Mesh_0', faces: [0, 1] },
    },
  ],
};
describe('Spatial Artefact V0 schema', () => {
  it('accepts the V0 triangle selector', () =>
    expect(safeParseSpatialArtefact(valid).success).toBe(true));
  it('rejects duplicate IDs', () =>
    expect(
      safeParseSpatialArtefact({ ...valid, regions: [valid.regions[0], { ...valid.regions[0] }] })
        .success,
    ).toBe(false));
  it('accepts optional SHA-256 integrity and preserves it through JSON', () => {
    const result = safeParseSpatialArtefact(
      JSON.parse(
        JSON.stringify({
          ...valid,
          payload: { ...valid.payload, integrity: { algorithm: 'sha256', hash: 'abc123' } },
        }),
      ),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.payload.integrity?.hash).toBe('abc123');
  });
  it('rejects an unknown integrity algorithm', () =>
    expect(
      safeParseSpatialArtefact({
        ...valid,
        payload: { ...valid.payload, integrity: { algorithm: 'sha1', hash: 'x' } },
      }).success,
    ).toBe(false));
  it('rejects remote payloads and unsupported versions', () =>
    expect(
      safeParseSpatialArtefact({
        ...valid,
        specVersion: '1.0.0',
        payload: { ...valid.payload, src: 'https://example.test/a.glb' },
      }).success,
    ).toBe(false));
});
