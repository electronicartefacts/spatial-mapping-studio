import { describe, expect, it } from 'vitest';
import {
  ProjectHistory,
  commands,
  compileSpatialArtefact,
  createWorkspaceProject,
  deserializeWorkspaceProject,
  serializeWorkspaceProject,
  type ProjectSourceAsset,
} from './index.js';
const source: ProjectSourceAsset = {
  name: 'cube.glb',
  format: 'glb',
  mimeType: 'model/gltf-binary',
  integrity: { algorithm: 'sha256', hash: 'hash' },
};
const region = {
  id: 'top',
  label: 'Top',
  tags: ['orange'],
  selector: { type: 'triangles' as const, mesh: 'Mesh_0', faces: [4] },
};
describe('WorkspaceProject', () => {
  it('compiles deterministically without editor state', () => {
    const p = createWorkspaceProject(source);
    const h = new ProjectHistory(p);
    h.execute(commands.createRegion(region));
    expect(compileSpatialArtefact(h.project)).toEqual(compileSpatialArtefact(h.project));
  });
  it('supports create, undo, redo and redo clearing', () => {
    const h = new ProjectHistory(createWorkspaceProject(source));
    h.execute(commands.createRegion(region));
    h.undo();
    expect(h.project.regions).toHaveLength(0);
    h.redo();
    expect(h.project.regions[0]?.id).toBe('top');
    h.undo();
    h.execute(commands.createRegion({ ...region, id: 'front' }));
    expect(h.canRedo).toBe(false);
  });
  it('serializes an internal snapshot', () => {
    const p = createWorkspaceProject(source);
    expect(deserializeWorkspaceProject(serializeWorkspaceProject(p)).source.integrity.hash).toBe(
      'hash',
    );
  });
  it('undoes selection changes', () => {
    const h = new ProjectHistory(createWorkspaceProject(source));
    h.execute(commands.setSelection({ id: 'selection-1', source: 'click', targets: [] }));
    h.execute(commands.addFacesToSelection('selection-1', { mesh: 'Mesh_0', faces: [1] }));
    h.undo();
    expect(h.project.selections[0]?.targets).toHaveLength(0);
  });
  it('updates region metadata as one undoable action', () => {
    const h = new ProjectHistory(createWorkspaceProject(source));
    h.execute(commands.createRegion(region));
    h.execute(
      commands.updateRegionMetadata('top', { id: 'handle', label: 'Handle', tags: ['wood'] }),
    );
    expect(h.project.regions[0]).toMatchObject({ id: 'handle', label: 'Handle', tags: ['wood'] });
    h.undo();
    expect(h.project.regions[0]).toMatchObject({ id: 'top', label: 'Top', tags: ['orange'] });
    h.redo();
    expect(h.project.regions[0]?.id).toBe('handle');
  });
});
