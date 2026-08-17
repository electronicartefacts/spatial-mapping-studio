export type CanonicalSceneId = `scene:${number}`;
export type CanonicalNodeId = `node:${number}`;
export type CanonicalMeshId = `mesh:${number}`;
export type CanonicalPrimitiveId = `primitive:${number}:${number}`;
export type CanonicalMaterialId = `material:${number}`;
export type ImportDiagnostic = {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
};
export type CanonicalPrimitive = {
  id: CanonicalPrimitiveId;
  meshId: CanonicalMeshId;
  materialId?: CanonicalMaterialId;
  index: number;
};
export type CanonicalModel = {
  id: string;
  source: {
    format: 'glb';
    name: string;
    mimeType: string;
    fileSize: number;
    sha256: string;
    importerVersion: '0.1.0';
  };
  scenes: { id: CanonicalSceneId; nodes: CanonicalNodeId[] }[];
  nodes: { id: CanonicalNodeId; meshId?: CanonicalMeshId; children: CanonicalNodeId[] }[];
  meshes: { id: CanonicalMeshId; primitiveIds: CanonicalPrimitiveId[] }[];
  primitives: CanonicalPrimitive[];
  materials: { id: CanonicalMaterialId; name?: string }[];
  diagnostics: ImportDiagnostic[];
};
export type ImportInput = {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
  sha256: string;
};
export type ImportResult = { model: CanonicalModel; diagnostics: ImportDiagnostic[] };
export interface SpatialImporter {
  canImport(input: Pick<ImportInput, 'name' | 'mimeType'>): boolean;
  import(input: ImportInput): Promise<ImportResult>;
}

const decoder = new TextDecoder();
function diagnostic(
  level: ImportDiagnostic['level'],
  code: string,
  message: string,
): ImportDiagnostic {
  return { level, code, message };
}
function parseGlbJson(bytes: ArrayBuffer): Record<string, unknown> {
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67)
    throw new Error('Not a GLB file.');
  if (view.getUint32(4, true) !== 2) throw new Error('Only GLB version 2 is supported.');
  const length = view.getUint32(8, true);
  if (length !== view.byteLength) throw new Error('GLB length does not match its bytes.');
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + chunkLength > view.byteLength)
    throw new Error('GLB JSON chunk is missing or invalid.');
  return JSON.parse(
    decoder
      .decode(new Uint8Array(bytes, 20, chunkLength))
      .replace(/\0+$/, '')
      .trim(),
  ) as Record<string, unknown>;
}
const values = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** The GLB reference importer: inspect source structure without rewriting its bytes. */
export class GltfImporter implements SpatialImporter {
  canImport(input: Pick<ImportInput, 'name' | 'mimeType'>) {
    return /\.glb$/i.test(input.name) || input.mimeType === 'model/gltf-binary';
  }

  async import(input: ImportInput): Promise<ImportResult> {
    const diagnostics: ImportDiagnostic[] = [];
    if (!this.canImport(input)) throw new Error('Unsupported input. Only .glb is supported.');
    if (!input.bytes.byteLength) throw new Error('The source file is empty.');
    const json = parseGlbJson(input.bytes);
    const meshes = values<Record<string, unknown>>(json.meshes);
    const materials = values<Record<string, unknown>>(json.materials);
    const nodes = values<Record<string, unknown>>(json.nodes);
    const scenes = values<Record<string, unknown>>(json.scenes);
    const primitives: CanonicalPrimitive[] = [];
    const canonicalMeshes = meshes.map((mesh, meshIndex) => {
      const id = `mesh:${meshIndex}` as CanonicalMeshId;
      const primitiveIds = values<Record<string, unknown>>(mesh.primitives).map(
        (primitive, index) => {
          const primitiveId = `primitive:${meshIndex}:${index}` as CanonicalPrimitiveId;
          const material = typeof primitive.material === 'number' ? primitive.material : undefined;
          primitives.push({
            id: primitiveId,
            meshId: id,
            materialId:
              material === undefined ? undefined : (`material:${material}` as CanonicalMaterialId),
            index,
          });
          const attributes = primitive.attributes as Record<string, unknown> | undefined;
          if (!attributes?.NORMAL)
            diagnostics.push(
              diagnostic('warning', 'missing-normals', `${primitiveId} has no NORMAL attribute.`),
            );
          if (!attributes?.TEXCOORD_0)
            diagnostics.push(
              diagnostic('info', 'missing-uvs', `${primitiveId} has no TEXCOORD_0 attribute.`),
            );
          return primitiveId;
        },
      );
      if (primitiveIds.length > 1)
        diagnostics.push(
          diagnostic('info', 'multiple-primitives', `${id} has ${primitiveIds.length} primitives.`),
        );
      return { id, primitiveIds };
    });
    const model: CanonicalModel = {
      id: `glb:${input.sha256}`,
      source: {
        format: 'glb',
        name: input.name,
        mimeType: input.mimeType,
        fileSize: input.bytes.byteLength,
        sha256: input.sha256,
        importerVersion: '0.1.0',
      },
      scenes: scenes.map((scene, index) => ({
        id: `scene:${index}` as CanonicalSceneId,
        nodes: values<number>(scene.nodes).map((node) => `node:${node}` as CanonicalNodeId),
      })),
      nodes: nodes.map((node, index) => ({
        id: `node:${index}` as CanonicalNodeId,
        meshId:
          typeof node.mesh === 'number' ? (`mesh:${node.mesh}` as CanonicalMeshId) : undefined,
        children: values<number>(node.children).map((child) => `node:${child}` as CanonicalNodeId),
      })),
      meshes: canonicalMeshes,
      primitives,
      materials: materials.map((material, index) => ({
        id: `material:${index}` as CanonicalMaterialId,
        name: typeof material.name === 'string' ? material.name : undefined,
      })),
      diagnostics,
    };
    if (!model.primitives.length)
      diagnostics.push(
        diagnostic('warning', 'no-primitives', 'The GLB contains no renderable primitives.'),
      );
    if (input.bytes.byteLength > 100 * 1024 * 1024)
      diagnostics.push(
        diagnostic(
          'warning',
          'large-file',
          'This GLB exceeds 100 MB and may be slow on this device.',
        ),
      );
    if (values<string>(json.extensionsRequired).length)
      diagnostics.push(
        diagnostic(
          'warning',
          'required-gltf-extensions',
          `This GLB requires extensions: ${values<string>(json.extensionsRequired).join(', ')}.`,
        ),
      );
    return { model, diagnostics };
  }
}
