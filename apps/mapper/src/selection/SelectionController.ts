import {
  commands,
  type ProjectHistory,
  type SelectionSet,
  type SelectionTarget,
} from '@electronic-artefacts/spatial-project-core';
import * as THREE from 'three';
import type { RuntimeModelMap, RuntimePrimitive } from '../model/ModelController';

export const ACTIVE_SELECTION_ID = 'active-selection';
export type SelectionMode = 'face' | 'mesh' | 'primitive' | 'material';

function targetFor(primitive: RuntimePrimitive, faces: number[]): SelectionTarget {
  return {
    mesh: primitive.selectorMesh,
    canonicalMeshId: primitive.meshId,
    canonicalPrimitiveId: primitive.primitiveId,
    canonicalMaterialId: primitive.materialId,
    faces,
  };
}

function allFaces(mesh: THREE.Mesh): number[] {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const count = geometry.getIndex()?.count ?? geometry.getAttribute('position').count;
  return Array.from({ length: Math.floor(count / 3) }, (_, face) => face);
}

/** Turns Three.js raycast results into undoable project selections. */
export class SelectionController {
  constructor(
    private readonly getHistory: () => ProjectHistory | undefined,
    private readonly changed: () => void,
  ) {}

  selectFace(primitive: RuntimePrimitive, face: number) {
    const history = this.ensureActiveSelection();
    if (!history) return;
    const active = this.active();
    const target = active?.targets.find(
      (item) => item.canonicalPrimitiveId === primitive.primitiveId,
    );
    if (target?.faces.includes(face)) {
      history.execute(
        commands.removeFacesFromSelection(ACTIVE_SELECTION_ID, targetFor(primitive, [face])),
      );
    } else {
      history.execute(
        commands.addFacesToSelection(ACTIVE_SELECTION_ID, targetFor(primitive, [face])),
      );
    }
    this.changed();
  }

  selectMesh(primitive: RuntimePrimitive) {
    const history = this.getHistory();
    if (!history) return;
    history.execute(
      commands.setSelection({
        id: ACTIVE_SELECTION_ID,
        source: 'manual',
        targets: [targetFor(primitive, allFaces(primitive.mesh))],
      }),
    );
    this.changed();
  }

  selectPrimitive(primitive: RuntimePrimitive) {
    const history = this.getHistory();
    if (!history) return;
    history.execute(
      commands.setSelection({
        id: ACTIVE_SELECTION_ID,
        source: 'manual',
        targets: [targetFor(primitive, allFaces(primitive.mesh))],
      }),
    );
    this.changed();
  }

  selectMaterial(primitive: RuntimePrimitive, runtime: RuntimeModelMap) {
    const history = this.getHistory();
    if (!history || !primitive.materialId) return;
    const targets = [...runtime.primitives.values()]
      .filter((item) => item.materialId === primitive.materialId)
      .map((item) => targetFor(item, allFaces(item.mesh)));
    history.execute(commands.setSelection({ id: ACTIVE_SELECTION_ID, source: 'manual', targets }));
    this.changed();
  }

  clear() {
    const history = this.getHistory();
    if (!history) return;
    history.execute(commands.clearSelection());
    this.changed();
  }

  active(): SelectionSet | undefined {
    const history = this.getHistory();
    const id = history?.project.activeSelectionId;
    return history?.project.selections.find((selection) => selection.id === id);
  }

  private ensureActiveSelection(): ProjectHistory | undefined {
    const history = this.getHistory();
    if (!history) return;
    if (!this.active()) {
      history.execute(
        commands.setSelection({ id: ACTIVE_SELECTION_ID, source: 'click', targets: [] }),
      );
    }
    return history;
  }
}
