import {
  commands,
  type ProjectHistory,
  type SelectionSet,
  type SelectionTarget,
} from '@electronic-artefacts/spatial-project-core';
import * as THREE from 'three';
import type { CanonicalPrimitiveId } from '@electronic-artefacts/spatial-importers';
import type { RuntimeModelMap, RuntimePrimitive } from '../model/ModelController';

export const ACTIVE_SELECTION_ID = 'active-selection';
export type SelectionMode =
  'face' | 'mesh' | 'primitive' | 'material' | 'connected' | 'brush' | 'erase' | 'lasso';

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

  selectFace(primitive: RuntimePrimitive, face: number, operation: 'replace' | 'add' | 'subtract') {
    const history = this.ensureActiveSelection();
    if (!history) return;
    if (operation === 'replace') {
      history.execute(
        commands.setSelection({
          id: ACTIVE_SELECTION_ID,
          source: 'click',
          targets: [targetFor(primitive, [face])],
        }),
      );
      this.changed();
      return;
    }
    const active = this.active();
    const target = active?.targets.find(
      (item) => item.canonicalPrimitiveId === primitive.primitiveId,
    );
    if (operation === 'subtract' || target?.faces.includes(face)) {
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

  selectConnected(primitive: RuntimePrimitive, faces: number[]) {
    const history = this.getHistory();
    if (!history) return;
    history.execute(
      commands.setSelection({
        id: ACTIVE_SELECTION_ID,
        source: 'manual',
        targets: [targetFor(primitive, faces)],
      }),
    );
    this.changed();
  }

  replaceActiveFaces(runtime: RuntimeModelMap, facesByPrimitive: Map<string, number[]>) {
    const history = this.getHistory();
    if (!history) return;
    const targets = [...facesByPrimitive].flatMap(([primitiveId, faces]) => {
      const primitive = runtime.primitives.get(primitiveId as CanonicalPrimitiveId);
      return primitive && faces.length ? [targetFor(primitive, faces)] : [];
    });
    history.execute(commands.setSelection({ id: ACTIVE_SELECTION_ID, source: 'manual', targets }));
    this.changed();
  }

  applyStroke(
    runtime: RuntimeModelMap,
    hits: Map<CanonicalPrimitiveId, Set<number>>,
    erase: boolean,
  ) {
    const history = this.getHistory();
    if (!history || !hits.size) return;
    const facesByPrimitive = new Map<string, Set<number>>();
    this.active()?.targets.forEach((target) => {
      if (target.canonicalPrimitiveId)
        facesByPrimitive.set(target.canonicalPrimitiveId, new Set(target.faces));
    });
    hits.forEach((faces, primitiveId) => {
      const current = facesByPrimitive.get(primitiveId) ?? new Set<number>();
      faces.forEach((face) => (erase ? current.delete(face) : current.add(face)));
      facesByPrimitive.set(primitiveId, current);
    });
    const targets = [...facesByPrimitive].flatMap(([primitiveId, faces]) => {
      const primitive = runtime.primitives.get(primitiveId as CanonicalPrimitiveId);
      return primitive && faces.size
        ? [
            targetFor(
              primitive,
              [...faces].sort((a, b) => a - b),
            ),
          ]
        : [];
    });
    history.execute(commands.setSelection({ id: ACTIVE_SELECTION_ID, source: 'manual', targets }));
    this.changed();
  }

  clear() {
    const history = this.getHistory();
    if (!history) return;
    history.execute(commands.clearSelection());
    this.changed();
  }

  invert(runtime: RuntimeModelMap) {
    const history = this.getHistory();
    if (!history) return;
    const selected = new Map(
      this.active()?.targets.map((target) => [
        target.canonicalPrimitiveId,
        new Set(target.faces),
      ]) ?? [],
    );
    const targets = [...runtime.primitives.values()].map((primitive) =>
      targetFor(
        primitive,
        allFaces(primitive.mesh).filter((face) => !selected.get(primitive.primitiveId)?.has(face)),
      ),
    );
    history.execute(commands.setSelection({ id: ACTIVE_SELECTION_ID, source: 'manual', targets }));
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
