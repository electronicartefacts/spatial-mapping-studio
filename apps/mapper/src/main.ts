import { downloadJson, parseTags, sha256 } from '@electronic-artefacts/shared';
import {
  parseSpatialArtefact,
  type SpatialArtefact,
  type SpatialRegion,
} from '@electronic-artefacts/spatial-artefact-schema';
import {
  ProjectHistory,
  commands,
  compileSpatialArtefact,
  createWorkspaceProject,
  deserializeWorkspaceProject,
  serializeWorkspaceProject,
} from '@electronic-artefacts/spatial-project-core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ModelController } from './model/ModelController';
import { SelectionController, type SelectionMode } from './selection/SelectionController';
import type { CanonicalPrimitiveId } from '@electronic-artefacts/spatial-importers';
import { SelectionOverlayRenderer } from './selection/SelectionOverlayRenderer';
import { SpatialComputeClient } from './compute/SpatialComputeClient';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const viewport = $('#viewport');
const status = $('#status');
const hint = $('#drop-hint');
const list = $('#regions');
const selectedCount = $('#selection-count');
const undoButton = $('#undo') as HTMLButtonElement;
const redoButton = $('#redo') as HTMLButtonElement;
const inspector = $('#region-inspector');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const controls = new OrbitControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const overlayRenderer = new SelectionOverlayRenderer();
const modelController = new ModelController();
const compute = new SpatialComputeClient();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x252832, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 4, 2);
scene.add(light);
controls.enableDamping = true;

let root: THREE.Object3D | undefined;
let objectUrl: string | undefined;
let payloadHash: string | undefined;
let regions: SpatialRegion[] = [];
let projectHistory: ProjectHistory | undefined;
let activeRegionId: string | undefined;
let selectionMode: SelectionMode = 'face';
let brushStroke: Map<CanonicalPrimitiveId, Set<number>> | undefined;
let brushPending: Promise<void>[] = [];
let brushRequestVersion = 0;
let lassoPoints: [number, number][] | undefined;
let lassoOperation: 'replace' | 'add' | 'subtract' = 'replace';
let lassoGeneration = 0;
let brushRadiusPx = 36;
let raf = 0;
let topologyReady = false;
let topologyGeneration = 0;
type BenchmarkSnapshot = {
  load?: Record<string, number>;
  overlayMs?: number;
  brushMs?: number;
  raycastMs?: number;
  topologyReadyMs?: number;
};
type BenchmarkWindow = Window & {
  __spatialBenchmark?: BenchmarkSnapshot;
  __spatialBenchmarkMeasureBrush?: (
    x: number,
    y: number,
    radius: number,
  ) => Promise<number | undefined>;
  __spatialBenchmarkMeasureOverlay?: (faces: number) => number | undefined;
};
const benchmark = window as BenchmarkWindow;
benchmark.__spatialBenchmark = {};

const selectedFaceCount = () =>
  selectionController.active()?.targets.reduce((total, target) => total + target.faces.length, 0) ??
  0;
const selectionController = new SelectionController(
  () => projectHistory,
  () => syncProject(),
);

function syncSelectionVisuals() {
  const count = selectedFaceCount();
  const overlayMs = overlayRenderer.rebuild(
    modelController.model?.runtime,
    selectionController.active(),
  );
  benchmark.__spatialBenchmark = { ...benchmark.__spatialBenchmark, overlayMs };
  selectedCount.textContent = `${count} selected faces`;
  selectedCount.dataset.faces = String(count);
  const targets = selectionController.active()?.targets.length ?? 0;
  const available = [...(modelController.model?.runtime.primitives.values() ?? [])].reduce(
    (total, primitive) => total + Math.floor((primitive.mesh.geometry.getIndex()?.count ?? 0) / 3),
    0,
  );
  $('#selection-stats').textContent =
    `${targets} targets · ${available ? Math.round((count / available) * 100) : 0}% of model triangles`;
  render();
}

function syncProject() {
  if (!projectHistory) return;
  regions = projectHistory.project.regions;
  renderRegions();
  syncSelectionVisuals();
  undoButton.disabled = !projectHistory.canUndo;
  redoButton.disabled = !projectHistory.canRedo;
  localStorage.setItem(
    'spatial-mapping-studio:workspace-project',
    serializeWorkspaceProject(projectHistory.project),
  );
}

function render() {
  if (!raf) {
    raf = requestAnimationFrame(() => {
      raf = 0;
      controls.update();
      renderer.render(scene, camera);
    });
  }
}
controls.addEventListener('change', render);

function resize() {
  const { clientWidth: width, clientHeight: height } = viewport;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  render();
}
new ResizeObserver(resize).observe(viewport);

function frame() {
  if (!root) return;
  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  camera.position
    .copy(sphere.center)
    .add(new THREE.Vector3(0.8, 0.6, 1).normalize().multiplyScalar(sphere.radius * 3));
  controls.target.copy(sphere.center);
  controls.update();
  render();
}

function editRegion(region: SpatialRegion) {
  activeRegionId = region.id;
  inspector.hidden = false;
  $<HTMLInputElement>('#edit-region-id').value = region.id;
  $<HTMLInputElement>('#edit-region-label').value = region.label;
  $<HTMLInputElement>('#edit-region-tags').value = region.tags.join(', ');
}

function commitRegionMetadata() {
  if (!projectHistory || !activeRegionId) return;
  const id = $<HTMLInputElement>('#edit-region-id').value.trim();
  const label = $<HTMLInputElement>('#edit-region-label').value.trim();
  if (!id || !label) return;
  const region = regions.find((item) => item.id === activeRegionId);
  const tags = parseTags($<HTMLInputElement>('#edit-region-tags').value);
  if (
    !region ||
    (region.id === id && region.label === label && region.tags.join(',') === tags.join(','))
  )
    return;
  try {
    projectHistory.execute(commands.updateRegionMetadata(activeRegionId, { id, label, tags }));
    activeRegionId = id;
    syncProject();
    status.textContent = `Updated ${label}.`;
  } catch (error) {
    status.textContent =
      error instanceof Error ? error.message : 'Region metadata could not be saved.';
    editRegion(region);
  }
}

function renderRegions() {
  list.replaceChildren(
    ...regions.map((region) => {
      const item = document.createElement('li');
      const edit = document.createElement('button');
      edit.textContent = `${region.label} · ${region.tags.join(', ') || 'untagged'}`;
      edit.onclick = () => editRegion(region);
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.onclick = () => {
        projectHistory?.execute(commands.deleteRegion(region.id));
        if (activeRegionId === region.id) {
          activeRegionId = undefined;
          inspector.hidden = true;
        }
        syncProject();
      };
      item.append(edit, ' ', remove);
      return item;
    }),
  );
}

function renderModelInfo() {
  const loaded = modelController.model;
  const info = $('#model-info');
  const diagnostics = $('#import-diagnostics');
  if (!loaded) {
    info.hidden = true;
    return;
  }
  info.hidden = false;
  $('#topology-status').textContent = topologyReady ? 'Topology ready' : 'Topology preparing…';
  $('#model-summary').textContent =
    `${loaded.canonical.source.name} · ${loaded.canonical.source.fileSize.toLocaleString()} bytes · ${loaded.canonical.nodes.length} nodes · ${loaded.canonical.meshes.length} meshes · ${loaded.canonical.primitives.length} primitives · ${loaded.canonical.materials.length} materials · SHA-256 verified`;
  diagnostics.replaceChildren(
    ...loaded.diagnostics.map((item) => {
      const entry = document.createElement('li');
      entry.textContent = `${item.level}: ${item.message}`;
      return entry;
    }),
  );
  const hasRuntimePrimitives = loaded.runtime.primitives.size > 0;
  const hasMaterials = loaded.runtime.materials.size > 0;
  const primitive = $<HTMLButtonElement>('[data-selection-mode="primitive"]');
  const material = $<HTMLButtonElement>('[data-selection-mode="material"]');
  primitive.disabled = !hasRuntimePrimitives;
  material.disabled = !hasMaterials;
  primitive.title = primitive.disabled
    ? 'No canonical primitive runtime mapping is available.'
    : '';
  material.title = material.disabled ? 'No canonical material runtime mapping is available.' : '';
  for (const mode of ['brush', 'erase', 'lasso'] as const)
    $<HTMLButtonElement>(`[data-selection-mode="${mode}"]`).disabled = !hasRuntimePrimitives;
  $<HTMLButtonElement>('[data-selection-mode="connected"]').disabled =
    !hasRuntimePrimitives || !topologyReady;
  $<HTMLButtonElement>('#grow-selection').disabled = !hasRuntimePrimitives || !topologyReady;
  $<HTMLButtonElement>('#shrink-selection').disabled = !hasRuntimePrimitives || !topologyReady;
}

function currentManifest(): SpatialArtefact | undefined {
  return projectHistory ? compileSpatialArtefact(projectHistory.project) : undefined;
}

function applyManifest(manifest: SpatialArtefact, source: string) {
  if (projectHistory) {
    for (const region of manifest.regions) projectHistory.execute(commands.createRegion(region));
    syncProject();
  }
  status.textContent = manifest.metadata.triangleMapping?.finalGlb
    ? `Loaded ${source}. Ensure it belongs to this final GLB.`
    : `Loaded ${source}. Warning: triangle stability metadata is missing.`;
}

async function open(file: File) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  status.textContent = `Loading ${file.name} locally…`;
  try {
    const generation = ++topologyGeneration;
    topologyReady = false;
    payloadHash = await sha256(await file.arrayBuffer());
    projectHistory = new ProjectHistory(
      createWorkspaceProject({
        name: file.name,
        format: 'glb',
        mimeType: 'model/gltf-binary',
        fileSize: file.size,
        importerVersion: '0.1.0',
        integrity: { algorithm: 'sha256', hash: payloadHash },
        provenance: {
          sourceFormat: 'glb',
          originalFileName: file.name,
          mimeType: file.type || 'model/gltf-binary',
          fileSize: file.size,
          sha256: payloadHash,
          importedAt: new Date().toISOString(),
          importerVersion: '0.1.0',
        },
      }),
    );
    const previous = modelController.detach();
    if (previous) scene.remove(previous);
    overlayRenderer.clear();
    const loaded = await modelController.load(file, payloadHash, objectUrl);
    root = loaded.root;
    scene.add(root);
    hint.hidden = true;
    activeRegionId = undefined;
    inspector.hidden = true;
    syncProject();
    renderModelInfo();
    frame();
    status.textContent =
      'Ready. SHA-256 fingerprint attached. Switch to Select and click triangles.';
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    benchmark.__spatialBenchmark = { ...benchmark.__spatialBenchmark, load: loaded.timings };
    void prepareTopology(loaded.computeGeometry, generation, performance.now());
  } catch {
    payloadHash = undefined;
    status.textContent = 'This GLB could not be loaded.';
  }
}

async function prepareTopology(
  geometry: import('./compute/protocol').ComputePrimitiveGeometry[],
  generation: number,
  started: number,
) {
  try {
    await compute.dispose();
    for (const primitive of geometry) await compute.register(primitive);
    await Promise.all(geometry.map((primitive) => compute.buildTopology(primitive.primitiveId)));
    if (generation !== topologyGeneration) return;
    topologyReady = true;
    benchmark.__spatialBenchmark = {
      ...benchmark.__spatialBenchmark,
      topologyReadyMs: performance.now() - started,
    };
    renderModelInfo();
  } catch {
    if (generation !== topologyGeneration) return;
    topologyReady = false;
    renderModelInfo();
    status.textContent = 'Topology processing failed. Basic selection remains available.';
  }
}

function hitAt(event: PointerEvent | MouseEvent) {
  const started = performance.now();
  if (!root) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    (-(event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster
    .intersectObject(root, true)
    .find((item) => (item.object as THREE.Mesh).isMesh);
  if (!hit || typeof hit.faceIndex !== 'number') {
    benchmark.__spatialBenchmark = {
      ...benchmark.__spatialBenchmark,
      raycastMs: performance.now() - started,
    };
    return;
  }
  const primitive = modelController.model?.runtime.primitiveByObject.get(hit.object);
  if (!primitive) {
    status.textContent = 'This runtime mesh has no canonical GLB primitive mapping.';
    return;
  }
  benchmark.__spatialBenchmark = {
    ...benchmark.__spatialBenchmark,
    raycastMs: performance.now() - started,
  };
  return { primitive, face: hit.faceIndex };
}

function queueBrushCandidates(
  primitive: import('./model/ModelController').RuntimePrimitive,
  event: PointerEvent,
) {
  const stroke = brushStroke;
  if (!stroke) return;
  const version = ++brushRequestVersion;
  const rect = renderer.domElement.getBoundingClientRect();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const pending = compute
    .brush(
      primitive.primitiveId,
      [event.clientX - rect.left, event.clientY - rect.top],
      brushRadiusPx,
      [rect.width, rect.height],
      primitive.mesh.matrixWorld.toArray(),
      viewProjection.toArray(),
    )
    .then((result) => {
      if (stroke !== brushStroke || version < brushRequestVersion - 1) return;
      const faces = stroke.get(primitive.primitiveId) ?? new Set<number>();
      result.faces.forEach((face) => faces.add(face));
      stroke.set(primitive.primitiveId, faces);
      benchmark.__spatialBenchmark = { ...benchmark.__spatialBenchmark, brushMs: result.wallMs };
    })
    .catch(() => undefined);
  brushPending.push(pending);
}

benchmark.__spatialBenchmarkMeasureBrush = async (x, y, radius) => {
  const hit = hitAt(new PointerEvent('pointermove', { clientX: x, clientY: y }));
  if (!hit) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const result = await compute.brush(
    hit.primitive.primitiveId,
    [x - rect.left, y - rect.top],
    radius,
    [rect.width, rect.height],
    hit.primitive.mesh.matrixWorld.toArray(),
    viewProjection.toArray(),
  );
  benchmark.__spatialBenchmark = { ...benchmark.__spatialBenchmark, brushMs: result.wallMs };
  return result.faces.length;
};
benchmark.__spatialBenchmarkMeasureOverlay = (faces) => {
  const primitive = modelController.model?.runtime.primitives.values().next().value;
  if (!primitive) return;
  const count = Math.min(faces, Math.floor((primitive.mesh.geometry.getIndex()?.count ?? 0) / 3));
  const elapsed = overlayRenderer.rebuild(modelController.model?.runtime, {
    id: 'benchmark-overlay',
    source: 'manual',
    targets: [
      {
        mesh: primitive.selectorMesh,
        canonicalPrimitiveId: primitive.primitiveId,
        faces: Array.from({ length: count }, (_, index) => index),
      },
    ],
  });
  overlayRenderer.clear();
  return elapsed;
};

function updateBrushPreview(event: PointerEvent) {
  const preview = $('#brush-preview');
  if (selectionMode !== 'brush' && selectionMode !== 'erase') {
    preview.hidden = true;
    return;
  }
  const rect = viewport.getBoundingClientRect();
  preview.hidden = false;
  preview.style.left = `${event.clientX - rect.left}px`;
  preview.style.top = `${event.clientY - rect.top}px`;
  preview.style.width = `${brushRadiusPx * 2}px`;
  preview.style.height = `${brushRadiusPx * 2}px`;
}

function pick(event: MouseEvent) {
  const hit = hitAt(event);
  if (!hit) return;
  const { primitive, face } = hit;
  if (selectionMode === 'mesh') selectionController.selectMesh(primitive);
  else if (selectionMode === 'primitive') selectionController.selectPrimitive(primitive);
  else if (selectionMode === 'material')
    selectionController.selectMaterial(primitive, modelController.model!.runtime);
  else if (selectionMode === 'connected') void selectConnected(primitive, face);
  else selectionController.selectFace(primitive, face);
}

renderer.domElement.addEventListener('click', (event) => {
  if (selectionMode !== 'brush' && selectionMode !== 'erase' && selectionMode !== 'lasso')
    pick(event);
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (selectionMode === 'lasso') {
    const rect = renderer.domElement.getBoundingClientRect();
    lassoPoints = [[event.clientX - rect.left, event.clientY - rect.top]];
    lassoOperation = event.altKey ? 'subtract' : event.shiftKey ? 'add' : 'replace';
    $('#lasso-path').hidden = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    controls.enabled = false;
    return;
  }
  if (selectionMode !== 'brush' && selectionMode !== 'erase') return;
  brushStroke = new Map();
  renderer.domElement.setPointerCapture(event.pointerId);
  const hit = hitAt(event);
  if (hit) brushStroke.set(hit.primitive.primitiveId, new Set([hit.face]));
  if (hit) queueBrushCandidates(hit.primitive, event);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  const cursor = $('#cursor-hud');
  const rect = viewport.getBoundingClientRect();
  cursor.hidden = false;
  cursor.style.left = `${event.clientX - rect.left}px`;
  cursor.style.top = `${event.clientY - rect.top}px`;
  const title = cursor.querySelector('strong')!;
  const detail = cursor.querySelector('span')!;
  title.textContent = selectionMode.toUpperCase();
  detail.textContent =
    selectionMode === 'lasso'
      ? 'Draw a closed area'
      : selectionMode === 'brush'
        ? 'Paint surfaces'
        : selectionMode === 'erase'
          ? 'Remove surfaces'
          : 'Click a surface';
  if (lassoPoints) {
    const rect = renderer.domElement.getBoundingClientRect();
    lassoPoints.push([event.clientX - rect.left, event.clientY - rect.top]);
    $('#lasso-path polyline').setAttribute(
      'points',
      lassoPoints.map((point) => point.join(',')).join(' '),
    );
    return;
  }
  updateBrushPreview(event);
  if (!brushStroke) return;
  const hit = hitAt(event);
  if (!hit) return;
  const faces = brushStroke.get(hit.primitive.primitiveId) ?? new Set<number>();
  faces.add(hit.face);
  brushStroke.set(hit.primitive.primitiveId, faces);
  queueBrushCandidates(hit.primitive, event);
});
renderer.domElement.addEventListener('pointerleave', () => {
  $('#brush-preview').hidden = true;
  $('#cursor-hud').hidden = true;
});
renderer.domElement.addEventListener('pointerup', async (event) => {
  if (lassoPoints) {
    const polygon = lassoPoints;
    const request = ++lassoGeneration;
    lassoPoints = undefined;
    $('#lasso-path').hidden = true;
    controls.enabled = true;
    const runtime = modelController.model?.runtime;
    if (runtime && polygon.length > 2) {
      const rect = renderer.domElement.getBoundingClientRect();
      const vp = new THREE.Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .toArray();
      const results = await Promise.all(
        [...runtime.primitives.values()].map(
          async (primitive) =>
            [
              primitive.primitiveId,
              (
                await compute.lasso(
                  primitive.primitiveId,
                  polygon,
                  [rect.width, rect.height],
                  primitive.mesh.matrixWorld.toArray(),
                  vp,
                )
              ).faces,
            ] as const,
        ),
      );
      if (request !== lassoGeneration || runtime !== modelController.model?.runtime) return;
      const current =
        lassoOperation === 'replace'
          ? new Map<string, number[]>()
          : new Map(
              selectionController
                .active()
                ?.targets.map((t) => [t.canonicalPrimitiveId!, t.faces]) ?? [],
            );
      results.forEach(([id, faces]) => {
        const set = new Set(current.get(id) ?? []);
        faces.forEach((face) => (lassoOperation === 'subtract' ? set.delete(face) : set.add(face)));
        current.set(id, [...set]);
      });
      selectionController.replaceActiveFaces(runtime, current);
    }
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    return;
  }
  if (!brushStroke) return;
  await Promise.all(brushPending);
  brushPending = [];
  if (modelController.model)
    selectionController.applyStroke(
      modelController.model.runtime,
      brushStroke,
      selectionMode === 'erase',
    );
  brushStroke = undefined;
  if (renderer.domElement.hasPointerCapture(event.pointerId))
    renderer.domElement.releasePointerCapture(event.pointerId);
});
viewport.addEventListener('dragover', (event) => event.preventDefault());
viewport.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file) void open(file);
});
$('#glb-input').addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void open(file);
});
$('#manifest-input').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    applyManifest(parseSpatialArtefact(JSON.parse(await file.text())), file.name);
  } catch {
    status.textContent = 'This artifact.json is invalid or unsupported.';
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-selection-mode]').forEach((button) => {
  button.onclick = () => {
    selectionMode = button.dataset.selectionMode as SelectionMode;
    document.body.dataset.tool = selectionMode;
    document.body.classList.toggle('erase-active', selectionMode === 'erase');
    document.querySelectorAll<HTMLButtonElement>('[data-selection-mode]').forEach((modeButton) => {
      modeButton.setAttribute('aria-pressed', String(modeButton === button));
    });
    const captions: Record<SelectionMode, string> = {
      face: 'Face selection',
      mesh: 'Mesh selection',
      primitive: 'Primitive selection',
      material: 'Material selection',
      connected: 'Connected surfaces',
      brush: 'Surface brush',
      erase: 'Selection eraser',
      lasso: 'Lasso selection',
    };
    $('#active-tool-caption').textContent = captions[selectionMode];
  };
});
document.querySelectorAll<HTMLButtonElement>('.workflow-nav .mode').forEach((button, index) => {
  button.onclick = () => {
    document
      .querySelectorAll<HTMLButtonElement>('.workflow-nav .mode')
      .forEach((mode) => mode.classList.toggle('active', mode === button));
    const panels = document.querySelectorAll<HTMLElement>('aside .panel-section');
    panels[Math.min(index, panels.length - 1)]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };
});
$('#brush-radius').addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  brushRadiusPx = Number(input.value);
  $('#brush-radius-value').textContent = `${brushRadiusPx} px`;
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  input.style.setProperty(
    '--brush-fill',
    `${((brushRadiusPx - minimum) / (maximum - minimum)) * 100}%`,
  );
});
async function selectConnected(
  primitive: import('./model/ModelController').RuntimePrimitive,
  face: number,
) {
  if (!topologyReady) return;
  try {
    const result = await compute.connected(primitive.primitiveId, face);
    selectionController.selectConnected(primitive, result.faces);
  } catch {
    status.textContent = 'Topology processing failed. Basic selection remains available.';
  }
}
async function transformSelection(kind: 'grow' | 'shrink') {
  const runtime = modelController.model?.runtime;
  const active = selectionController.active();
  if (!runtime || !active || !topologyReady) return;
  try {
    const results = await Promise.all(
      active.targets.flatMap((target) =>
        target.canonicalPrimitiveId
          ? [
              (kind === 'grow' ? compute.grow : compute.shrink)(
                target.canonicalPrimitiveId as CanonicalPrimitiveId,
                target.faces,
              ),
            ]
          : [],
      ),
    );
    const mapped = new Map<string, number[]>();
    active.targets.forEach((target, index) => {
      if (target.canonicalPrimitiveId)
        mapped.set(target.canonicalPrimitiveId, results[index]?.faces ?? target.faces);
    });
    selectionController.replaceActiveFaces(runtime, mapped);
  } catch {
    status.textContent = 'Topology processing failed. Basic selection remains available.';
  }
}
$('#grow-selection').onclick = () => void transformSelection('grow');
$('#shrink-selection').onclick = () => void transformSelection('shrink');
$('#reset-camera').onclick = frame;
$('#try-example').onclick = async () => {
  try {
    const response = await fetch(new URL('examples/shared-material.glb', document.baseURI));
    if (!response.ok) throw new Error('Example is unavailable.');
    await open(
      new File([await response.blob()], 'shared-material.glb', { type: 'model/gltf-binary' }),
    );
  } catch {
    status.textContent = 'The local example could not be loaded.';
  }
};
$('#clear-selection').onclick = () => selectionController.clear();
$('#invert-selection').onclick = () => {
  if (modelController.model) selectionController.invert(modelController.model.runtime);
};
undoButton.onclick = () => {
  projectHistory?.undo();
  syncProject();
};
redoButton.onclick = () => {
  projectHistory?.redo();
  syncProject();
};
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lassoPoints) {
    lassoGeneration += 1;
    lassoPoints = undefined;
    $('#lasso-path').hidden = true;
    controls.enabled = true;
    return;
  }
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoButton.click();
    else undoButton.click();
  } else if (event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoButton.click();
  }
});
document
  .querySelectorAll<HTMLInputElement>('#edit-region-id, #edit-region-label, #edit-region-tags')
  .forEach((input) => {
    input.addEventListener('blur', commitRegionMetadata);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  });
$('#restore-draft').onclick = () => {
  const saved = localStorage.getItem('spatial-mapping-studio:workspace-project');
  if (!saved) {
    status.textContent = 'No local draft is available on this device.';
    return;
  }
  try {
    projectHistory = new ProjectHistory(deserializeWorkspaceProject(saved));
    syncProject();
    status.textContent = 'Restored local WorkspaceProject draft.';
  } catch {
    localStorage.removeItem('spatial-mapping-studio:workspace-project');
    status.textContent = 'The local draft was invalid and has been discarded.';
  }
};
$('#save-region').onclick = () => {
  const id = $<HTMLInputElement>('#region-id').value.trim();
  const label = $<HTMLInputElement>('#region-label').value.trim();
  const selection = selectionController.active();
  if (!id || !label || !selection?.targets.some((target) => target.faces.length)) {
    status.textContent = 'Select at least one face, then provide an ID and label.';
    return;
  }
  if (regions.some((region) => region.id === id)) {
    status.textContent = 'Region IDs must be unique.';
    return;
  }
  const targets = selection.targets.filter((target) => target.faces.length);
  for (const [index, target] of targets.entries()) {
    if (!target.faces.length) continue;
    projectHistory?.execute(
      commands.createRegion({
        id: index === 0 ? id : `${id}-${index + 1}`,
        label,
        tags: parseTags($<HTMLInputElement>('#region-tags').value),
        selector: { type: 'triangles', mesh: target.mesh, faces: [...target.faces] },
      }),
    );
  }
  syncProject();
  const created = regions.find((region) => region.id === id);
  if (created) {
    editRegion(created);
    $<HTMLInputElement>('#edit-region-id').focus();
  }
  status.textContent = `Saved ${label}. Selection remains active for refinement.`;
};
$('#export-manifest').onclick = () => {
  if (!root) {
    status.textContent = 'Open a GLB first.';
    return;
  }
  const manifest = currentManifest();
  if (!manifest) return;
  downloadJson('artifact.json', manifest);
  status.textContent = 'Exported artifact.json. Keep it next to the final GLB as model.glb.';
};
render();
