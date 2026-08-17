import type { SelectionSet } from '@electronic-artefacts/spatial-project-core';
import * as THREE from 'three';
import type { RuntimeModelMap } from '../model/ModelController';
import type { CanonicalPrimitiveId } from '@electronic-artefacts/spatial-importers';

/** Three.js-only projection of the active SelectionSet; it owns no project state. */
export class SelectionOverlayRenderer {
  private overlays: THREE.Mesh[] = [];

  rebuild(runtime: RuntimeModelMap | undefined, selection: SelectionSet | undefined) {
    this.clear();
    if (!runtime || !selection) return;

    for (const target of selection.targets) {
      const mesh = target.canonicalPrimitiveId
        ? runtime.primitives.get(target.canonicalPrimitiveId as CanonicalPrimitiveId)?.mesh
        : undefined;
      if (!mesh || !target.faces.length) continue;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex();
      const vertices: number[] = [];
      for (const face of target.faces) {
        for (let point = 0; point < 3; point += 1) {
          const offset = index ? index.getX(face * 3 + point) : face * 3 + point;
          vertices.push(position.getX(offset), position.getY(offset), position.getZ(offset));
        }
      }
      const overlay = new THREE.Mesh(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(vertices, 3),
        ),
        new THREE.MeshBasicMaterial({
          color: 0xffc400,
          side: THREE.DoubleSide,
          depthWrite: false,
          transparent: true,
          opacity: 0.82,
        }),
      );
      overlay.renderOrder = 10;
      mesh.add(overlay);
      this.overlays.push(overlay);
    }
  }

  clear() {
    this.overlays.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.overlays = [];
  }
}
