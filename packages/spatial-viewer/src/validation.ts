import type { SpatialArtefact } from '@electronic-artefacts/spatial-artefact-schema';
import * as THREE from 'three';
import { SpatialArtefactError } from './errors.js';

export function validateSelectors(artifact: SpatialArtefact, root: THREE.Object3D) {
  for (const region of artifact.regions) {
    const selector = region.selector;
    const targetName = selector.type === 'node' ? selector.node : selector.mesh;
    let target: THREE.Object3D | undefined;
    root.traverse((object) => {
      if (!target && object.name === targetName) target = object;
    });
    if (!target)
      throw new SpatialArtefactError(
        'SELECTOR_TARGET_NOT_FOUND',
        `Region "${region.id}" references missing target "${targetName}".`,
      );
    if (selector.type === 'triangles') {
      const mesh = target as THREE.Mesh;
      const position = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute(
        'position',
      );
      if (!position)
        throw new SpatialArtefactError(
          'SELECTOR_TARGET_NOT_FOUND',
          `Region "${region.id}" target "${targetName}" cannot be picked.`,
        );
      const triangles = Math.floor(position.count / 3);
      const index = (mesh.geometry as THREE.BufferGeometry).getIndex();
      const count = index ? Math.floor(index.count / 3) : triangles;
      if (selector.faces.some((face) => face >= count))
        throw new SpatialArtefactError(
          'SELECTOR_OUT_OF_BOUNDS',
          `Region "${region.id}" references a triangle outside "${targetName}".`,
        );
    }
  }
}
