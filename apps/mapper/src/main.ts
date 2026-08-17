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
let brushRadiusPx = 36;
let raf = 0;

const selectedFaceCount = () =>
  selectionController.active()?.targets.reduce((total, target) => total + target.faces.length, 0) ??
  0;
const selectionController = new SelectionController(
  () => projectHistory,
  () => syncProject(),
);

function syncSelectionVisuals() {
  const count = selectedFaceCount();
  overlayRenderer.rebuild(modelController.model?.runtime, selectionController.active());
  selectedCount.textContent = `${count} selected faces`;
  selectedCount.dataset.faces = String(count);
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
  for (const mode of ['connected', 'brush', 'erase'] as const)
    $<HTMLButtonElement>(`[data-selection-mode="${mode}"]`).disabled = !hasRuntimePrimitives;
  $<HTMLButtonElement>('#grow-selection').disabled = !hasRuntimePrimitives;
  $<HTMLButtonElement>('#shrink-selection').disabled = !hasRuntimePrimitives;
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
  } catch {
    payloadHash = undefined;
    status.textContent = 'This GLB could not be loaded.';
  }
}

function hitAt(event: PointerEvent | MouseEvent) {
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
  if (!hit || typeof hit.faceIndex !== 'number') return;
  const primitive = modelController.model?.runtime.primitiveByObject.get(hit.object);
  if (!primitive) {
    status.textContent = 'This runtime mesh has no canonical GLB primitive mapping.';
    return;
  }
  return { primitive, face: hit.faceIndex };
}

function brushFaces(
  primitive: import('./model/ModelController').RuntimePrimitive,
  event: PointerEvent,
) {
  const geometry = primitive.mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const rect = renderer.domElement.getBoundingClientRect();
  const point = new THREE.Vector3();
  const candidates: number[] = [];
  for (let face = 0; face < Math.floor((index?.count ?? position.count) / 3); face += 1) {
    point.set(0, 0, 0);
    for (let offset = 0; offset < 3; offset += 1) {
      const vertex = index ? index.getX(face * 3 + offset) : face * 3 + offset;
      point.add(
        new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)),
      );
    }
    point
      .multiplyScalar(1 / 3)
      .applyMatrix4(primitive.mesh.matrixWorld)
      .project(camera);
    const x = rect.left + ((point.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - point.y) / 2) * rect.height;
    if (Math.hypot(event.clientX - x, event.clientY - y) <= brushRadiusPx) candidates.push(face);
  }
  return candidates;
}

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
  else if (selectionMode === 'connected')
    selectionController.selectConnected(primitive, face, modelController.model!.runtime);
  else selectionController.selectFace(primitive, face);
}

renderer.domElement.addEventListener('click', (event) => {
  if (selectionMode !== 'brush' && selectionMode !== 'erase') pick(event);
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (selectionMode !== 'brush' && selectionMode !== 'erase') return;
  brushStroke = new Map();
  renderer.domElement.setPointerCapture(event.pointerId);
  const hit = hitAt(event);
  if (hit) brushStroke.set(hit.primitive.primitiveId, new Set(brushFaces(hit.primitive, event)));
});
renderer.domElement.addEventListener('pointermove', (event) => {
  updateBrushPreview(event);
  if (!brushStroke) return;
  const hit = hitAt(event);
  if (!hit) return;
  const faces = brushStroke.get(hit.primitive.primitiveId) ?? new Set<number>();
  brushFaces(hit.primitive, event).forEach((face) => faces.add(face));
  brushStroke.set(hit.primitive.primitiveId, faces);
});
renderer.domElement.addEventListener('pointerleave', () => ($('#brush-preview').hidden = true));
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!brushStroke) return;
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
    document.body.classList.toggle('erase-active', selectionMode === 'erase');
    document.querySelectorAll<HTMLButtonElement>('[data-selection-mode]').forEach((modeButton) => {
      modeButton.setAttribute('aria-pressed', String(modeButton === button));
    });
  };
});
$('#brush-radius').addEventListener('input', (event) => {
  brushRadiusPx = Number((event.target as HTMLInputElement).value);
});
$('#grow-selection').onclick = () => {
  if (modelController.model) selectionController.grow(modelController.model.runtime);
};
$('#shrink-selection').onclick = () => {
  if (modelController.model) selectionController.shrink(modelController.model.runtime);
};
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
undoButton.onclick = () => {
  projectHistory?.undo();
  syncProject();
};
redoButton.onclick = () => {
  projectHistory?.redo();
  syncProject();
};
document.addEventListener('keydown', (event) => {
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
