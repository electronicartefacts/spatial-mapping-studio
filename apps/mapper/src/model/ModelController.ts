import {
  GltfImporter,
  type CanonicalMaterialId,
  type CanonicalMeshId,
  type CanonicalModel,
  type CanonicalNodeId,
  type CanonicalPrimitiveId,
  type ImportDiagnostic,
} from '@electronic-artefacts/spatial-importers';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ComputePrimitiveGeometry } from '../compute/protocol';

export type RuntimePrimitive = {
  primitiveId: CanonicalPrimitiveId;
  meshId: CanonicalMeshId;
  materialId?: CanonicalMaterialId;
  mesh: THREE.Mesh;
  selectorMesh: string;
};
export type RuntimeModelMap = {
  nodeObjects: Map<CanonicalNodeId, THREE.Object3D>;
  meshObjects: Map<CanonicalMeshId, THREE.Object3D[]>;
  primitives: Map<CanonicalPrimitiveId, RuntimePrimitive>;
  primitiveByObject: Map<THREE.Object3D, RuntimePrimitive>;
  materials: Map<CanonicalMaterialId, THREE.Material>;
};
export type LoadedModel = {
  canonical: CanonicalModel;
  root: THREE.Object3D;
  runtime: RuntimeModelMap;
  diagnostics: ImportDiagnostic[];
  timings: LoadTimings;
  computeGeometry: ComputePrimitiveGeometry[];
};

/** Local performance breakdown exposed to the Studio benchmark; it is never sent anywhere. */
export type LoadTimings = {
  fileReadMs: number;
  canonicalImportMs: number;
  gltfParseMs: number;
  runtimeMappingMs: number;
  topologyMs: number;
};

type Association = { nodes?: number; meshes?: number; primitives?: number; materials?: number };
type GltfWithAssociations = { parser: { associations?: Map<object, Association> } };

/** Keeps source import and Three.js runtime identity mapping out of the Mapper bootstrap. */
export class ModelController {
  private current: LoadedModel | undefined;

  async load(file: File, sha256: string, url: string): Promise<LoadedModel> {
    const started = performance.now();
    const bytes = await file.arrayBuffer();
    const fileReadMs = performance.now() - started;
    const canonicalStarted = performance.now();
    const imported = await new GltfImporter().import({
      name: file.name,
      mimeType: file.type || 'model/gltf-binary',
      bytes,
      sha256,
    });
    const canonicalImportMs = performance.now() - canonicalStarted;
    const gltfStarted = performance.now();
    const gltf = (await new GLTFLoader().loadAsync(url)) as unknown as GltfWithAssociations & {
      scene: THREE.Object3D;
    };
    const gltfParseMs = performance.now() - gltfStarted;
    const runtimeStarted = performance.now();
    const mapped = this.mapRuntime(imported.model, gltf.scene, gltf.parser.associations);
    const runtimeMappingMs = performance.now() - runtimeStarted;
    this.current = {
      canonical: imported.model,
      root: gltf.scene,
      runtime: mapped.runtime,
      diagnostics: [...imported.diagnostics],
      timings: {
        fileReadMs,
        canonicalImportMs,
        gltfParseMs,
        runtimeMappingMs,
        topologyMs: 0,
      },
      computeGeometry: mapped.computeGeometry,
    };
    if (mapped.runtime.primitives.size !== imported.model.primitives.length) {
      this.current.diagnostics.push({
        level: 'warning',
        code: 'runtime-primitive-mapping-incomplete',
        message: 'Some GLB primitives could not be mapped to their Three.js runtime object.',
      });
    }
    return this.current;
  }

  detach() {
    const previous = this.current;
    this.current = undefined;
    return previous?.root;
  }

  get model() {
    return this.current;
  }

  private mapRuntime(
    canonical: CanonicalModel,
    root: THREE.Object3D,
    associations: Map<object, Association> | undefined,
  ): { runtime: RuntimeModelMap; computeGeometry: ComputePrimitiveGeometry[] } {
    const runtime: RuntimeModelMap = {
      nodeObjects: new Map(),
      meshObjects: new Map(),
      primitives: new Map(),
      primitiveByObject: new Map(),
      materials: new Map(),
    };
    const computeGeometry: ComputePrimitiveGeometry[] = [];
    root.traverse((object) => {
      const association = associations?.get(object);
      if (association?.nodes !== undefined)
        runtime.nodeObjects.set(`node:${association.nodes}` as CanonicalNodeId, object);
      if (association?.meshes !== undefined) {
        const meshId = `mesh:${association.meshes}` as CanonicalMeshId;
        runtime.meshObjects.set(meshId, [...(runtime.meshObjects.get(meshId) ?? []), object]);
      }
      if (!(object as THREE.Mesh).isMesh) return;
      const mesh = object as THREE.Mesh;
      if (association?.meshes === undefined || association.primitives === undefined) return;
      const primitiveId =
        `primitive:${association.meshes}:${association.primitives}` as CanonicalPrimitiveId;
      const primitive = canonical.primitives.find((item) => item.id === primitiveId);
      if (!primitive) return;
      const selectorMesh = mesh.name || `mesh:${association.meshes}`;
      mesh.name ||= selectorMesh;
      const item: RuntimePrimitive = {
        primitiveId,
        meshId: primitive.meshId,
        materialId: primitive.materialId,
        mesh,
        selectorMesh,
      };
      runtime.primitives.set(primitiveId, item);
      runtime.primitiveByObject.set(mesh, item);
      computeGeometry.push(computeGeometryFor(primitiveId, mesh.geometry as THREE.BufferGeometry));
      if (primitive.materialId && mesh.material instanceof THREE.Material)
        runtime.materials.set(primitive.materialId, mesh.material);
    });
    return { runtime, computeGeometry };
  }
}

function computeGeometryFor(
  primitiveId: CanonicalPrimitiveId,
  geometry: THREE.BufferGeometry,
): ComputePrimitiveGeometry {
  const position = geometry.getAttribute('position');
  const indexed = geometry.getIndex();
  const positions = new Float32Array(position.array.length);
  positions.set(position.array as ArrayLike<number>);
  const indices = new Uint32Array(indexed?.count ?? position.count);
  for (let offset = 0; offset < indices.length; offset += 1)
    indices[offset] = indexed ? indexed.getX(offset) : offset;
  return { primitiveId, positions, indices };
}
