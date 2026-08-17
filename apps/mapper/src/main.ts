import { downloadJson, parseTags } from '@electronic-artefacts/shared';
import {
  parseSpatialArtefact,
  type SpatialArtefact,
  type SpatialRegion,
} from '@electronic-artefacts/spatial-artefact-schema';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sha256 } from '@electronic-artefacts/shared';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const viewport = $('#viewport'),
  status = $('#status'),
  hint = $('#drop-hint'),
  list = $('#regions'),
  selectedCount = $('#selection-count');
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000),
  renderer = new THREE.WebGLRenderer({ antialias: true }),
  controls = new OrbitControls(camera, renderer.domElement),
  raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x252832, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 4, 2);
scene.add(light);
controls.enableDamping = true;
let root: THREE.Object3D | undefined,
  objectUrl: string | undefined,
  modelName = 'model.glb',
  payloadHash: string | undefined,
  regions: SpatialRegion[] = [],
  selectionMeshes: THREE.Mesh[] = [],
  raf = 0;
const selection = new Map<THREE.Mesh, Set<number>>();
function render() {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      controls.update();
      renderer.render(scene, camera);
    });
}
controls.addEventListener('change', render);
function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
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
function clearSelection() {
  selection.clear();
  selectionMeshes.forEach((mesh) => {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  selectionMeshes = [];
  selectedCount.textContent = '0 selected faces';
  render();
}
function showFace(mesh: THREE.Mesh, face: number) {
  const geo = mesh.geometry as THREE.BufferGeometry,
    pos = geo.getAttribute('position'),
    idx = geo.getIndex(),
    data: number[] = [];
  for (let p = 0; p < 3; p++) {
    const i = idx ? idx.getX(face * 3 + p) : face * 3 + p;
    data.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  const out = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(data, 3)),
    new THREE.MeshBasicMaterial({
      color: 0xffc400,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      opacity: 0.82,
    }),
  );
  out.renderOrder = 10;
  mesh.add(out);
  selectionMeshes.push(out);
}
function renderRegions() {
  list.replaceChildren(
    ...regions.map((region) => {
      const item = document.createElement('li');
      item.textContent = `${region.label} · ${region.tags.join(', ') || 'untagged'}`;
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.onclick = () => {
        regions = regions.filter((candidate) => candidate.id !== region.id);
        renderRegions();
        persistDraft();
      };
      item.append(' ', remove);
      return item;
    }),
  );
}
function currentManifest(): SpatialArtefact | undefined {
  if (!root) return undefined;
  return parseSpatialArtefact({
    artifact: 'spatial',
    specVersion: '0.1.0',
    metadata: {
      id: modelName.replace(/\.glb$/i, '').replace(/[^\w.-]/g, '-'),
      title: modelName.replace(/\.glb$/i, ''),
      triangleMapping: { finalGlb: true },
    },
    payload: {
      type: 'model/gltf-binary',
      src: './model.glb',
      ...(payloadHash ? { integrity: { algorithm: 'sha256' as const, hash: payloadHash } } : {}),
    },
    regions,
  });
}
function persistDraft() {
  const manifest = currentManifest();
  if (manifest) localStorage.setItem('spatial-mapping-studio:draft', JSON.stringify(manifest));
}
function applyManifest(manifest: SpatialArtefact, source: string) {
  regions = manifest.regions;
  renderRegions();
  status.textContent = manifest.metadata.triangleMapping?.finalGlb
    ? `Loaded ${source}. Ensure it belongs to this final GLB.`
    : `Loaded ${source}. Warning: triangle stability metadata is missing.`;
}
async function open(file: File) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  modelName = file.name;
  status.textContent = `Loading ${file.name} locally…`;
  try {
    payloadHash = await sha256(await file.arrayBuffer());
    const gltf = await new GLTFLoader().loadAsync(objectUrl);
    if (root) scene.remove(root);
    root = gltf.scene;
    root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh && !node.name) node.name = 'Mesh_0';
    });
    scene.add(root);
    hint.hidden = true;
    clearSelection();
    regions = [];
    renderRegions();
    frame();
    status.textContent =
      'Ready. SHA-256 fingerprint attached. Switch to Select and click triangles.';
  } catch {
    payloadHash = undefined;
    status.textContent = 'This GLB could not be loaded.';
  }
}
function pick(event: PointerEvent) {
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
  const mesh = hit.object as THREE.Mesh,
    set = selection.get(mesh) ?? new Set<number>();
  if (set.has(hit.faceIndex)) set.delete(hit.faceIndex);
  else {
    set.add(hit.faceIndex);
    showFace(mesh, hit.faceIndex);
  }
  selection.set(mesh, set);
  selectedCount.textContent = `${[...selection.values()].reduce((total, faces) => total + faces.size, 0)} selected faces`;
  render();
}
renderer.domElement.addEventListener('click', pick);
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
$('#reset-camera').onclick = frame;
$('#clear-selection').onclick = clearSelection;
$('#restore-draft').onclick = () => {
  const saved = localStorage.getItem('spatial-mapping-studio:draft');
  if (!saved) {
    status.textContent = 'No local draft is available on this device.';
    return;
  }
  try {
    applyManifest(parseSpatialArtefact(JSON.parse(saved)), 'local draft');
  } catch {
    localStorage.removeItem('spatial-mapping-studio:draft');
    status.textContent = 'The local draft was invalid and has been discarded.';
  }
};
$('#save-region').onclick = () => {
  const id = $<HTMLInputElement>('#region-id').value.trim(),
    label = $<HTMLInputElement>('#region-label').value.trim();
  if (!id || !label || !selection.size) {
    status.textContent = 'Select at least one face, then provide an ID and label.';
    return;
  }
  if (regions.some((region) => region.id === id)) {
    status.textContent = 'Region IDs must be unique.';
    return;
  }
  for (const [mesh, faces] of selection)
    if (faces.size)
      regions.push({
        id,
        label,
        tags: parseTags($<HTMLInputElement>('#region-tags').value),
        selector: {
          type: 'triangles',
          mesh: mesh.name || 'Mesh_0',
          faces: [...faces].sort((a, b) => a - b),
        },
      });
  clearSelection();
  renderRegions();
  persistDraft();
  status.textContent = `Saved ${label}.`;
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
