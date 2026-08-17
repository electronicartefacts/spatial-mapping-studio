import { describe, expect, it } from 'vitest';
import { regionForFace } from './mapping.js';
const region = {
  id: 'handle',
  label: 'Handle',
  tags: [],
  selector: { type: 'triangles' as const, mesh: 'Mesh_0', faces: [2, 4] },
};
describe('face mapping', () => {
  it('finds the mapped face only', () => {
    expect(regionForFace([region], 'Mesh_0', 4)?.id).toBe('handle');
    expect(regionForFace([region], 'Mesh_0', 3)).toBeUndefined();
  });
});
