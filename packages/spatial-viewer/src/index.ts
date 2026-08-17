import {
  parseSpatialArtefact,
  type SpatialArtefact,
  type SpatialRegion,
} from '@electronic-artefacts/spatial-artefact-schema';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sha256 } from '@electronic-artefacts/shared';
import { SpatialArtefactError, SpatialPayloadIntegrityError } from './errors.js';
import { regionForFace } from './mapping.js';
import { validateSelectors } from './validation.js';

type ViewerEvent = 'region-enter' | 'region-leave' | 'region-select';
type Listener = (region: SpatialRegion) => void;
export type ViewerCapabilities = { webgl: boolean; webgpu: boolean; touch: boolean };

export function detectCapabilities(): ViewerCapabilities {
  const canvas = document.createElement('canvas');
  return {
    webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
    webgpu: 'gpu' in navigator,
    touch: navigator.maxTouchPoints > 0,
  };
}

export { regionForFace } from './mapping.js';
export { SpatialArtefactError, SpatialPayloadIntegrityError } from './errors.js';

function overlayFor(mesh: THREE.Mesh, faces: number[]): THREE.Mesh {
  const source = mesh.geometry as THREE.BufferGeometry;
  const position = source.getAttribute('position');
  const index = source.getIndex();
  const vertices: number[] = [];
  for (const face of faces)
    for (let point = 0; point < 3; point += 1) {
      const offset = index ? index.getX(face * 3 + point) : face * 3 + point;
      vertices.push(position.getX(offset), position.getY(offset), position.getZ(offset));
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.MeshBasicMaterial({
    color: 0xff5a1f,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const overlay = new THREE.Mesh(geometry, material);
  overlay.name = '__spatial-highlight';
  overlay.renderOrder = 10;
  return overlay;
}

export class SpatialViewer {
  readonly capabilities = detectCapabilities();
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly listeners = new Map<ViewerEvent, Set<Listener>>();
  private artifact?: SpatialArtefact;
  private root?: THREE.Object3D;
  private active?: SpatialRegion;
  private highlight?: THREE.Mesh;
  private raf = 0;

  constructor(readonly container: HTMLElement) {
    if (!this.capabilities.webgl)
      throw new Error('This browser does not provide a compatible WebGL renderer.');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#17191c');
    this.camera.position.set(2.6, 1.9, 3.2);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x303238, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(3, 4, 2);
    this.scene.add(light);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.render());
    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.domElement.addEventListener('pointermove', (event) => this.pick(event, false));
    this.renderer.domElement.addEventListener('click', (event) => this.pick(event, true));
    this.resize();
  }

  on(event: ViewerEvent, callback: Listener) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(callback);
    this.listeners.set(event, set);
    return () => set.delete(callback);
  }
  private emit(event: ViewerEvent, region: SpatialRegion) {
    this.listeners.get(event)?.forEach((listener) => listener(region));
  }
  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }
  render() {
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
  }
  resetCamera() {
    this.camera.position.set(2.6, 1.9, 3.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.render();
  }
  async load(url: string, signal?: AbortSignal) {
    let artifact: SpatialArtefact;
    try {
      const response = await fetch(url, { signal });
      if (!response.ok)
        throw new SpatialArtefactError(
          'PAYLOAD_NOT_FOUND',
          `Could not load artefact (${response.status}).`,
        );
      artifact = parseSpatialArtefact(await response.json());
    } catch (error) {
      if (error instanceof SpatialArtefactError) throw error;
      throw new SpatialArtefactError(
        'INVALID_MANIFEST',
        'The Spatial Artefact manifest is invalid.',
        { cause: error },
      );
    }
    const payloadUrl = new URL(artifact.payload.src, new URL(url, window.location.href)).toString();
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(payloadUrl, { signal });
      if (!response.ok)
        throw new SpatialArtefactError(
          'PAYLOAD_NOT_FOUND',
          `Could not load model payload (${response.status}).`,
        );
      bytes = await response.arrayBuffer();
    } catch (error) {
      if (error instanceof SpatialArtefactError) throw error;
      throw new SpatialArtefactError(
        'PAYLOAD_NOT_FOUND',
        'The model payload could not be loaded.',
        { cause: error },
      );
    }
    if (artifact.payload.integrity && (await sha256(bytes)) !== artifact.payload.integrity.hash)
      throw new SpatialPayloadIntegrityError();
    return this.loadManifest(artifact, bytes, payloadUrl);
  }
  async loadManifest(
    artifact: SpatialArtefact,
    bytes: ArrayBuffer,
    resourcePath = window.location.href,
  ) {
    this.artifact = parseSpatialArtefact(artifact);
    if (this.root) this.scene.remove(this.root);
    let gltf;
    try {
      gltf = await new GLTFLoader().parseAsync(bytes, resourcePath);
    } catch (error) {
      throw new SpatialArtefactError('GLB_PARSE_ERROR', 'The model payload is not a valid GLB.', {
        cause: error,
      });
    }
    this.root = gltf.scene;
    this.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    validateSelectors(this.artifact, this.root);
    this.scene.add(this.root);
    this.frame();
    this.render();
  }
  private frame() {
    if (!this.root) return;
    const box = new THREE.Box3().setFromObject(this.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position
      .copy(sphere.center)
      .add(new THREE.Vector3(0.8, 0.6, 1).normalize().multiplyScalar(distance * 1.35));
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }
  private pick(event: PointerEvent, select: boolean) {
    if (!this.root || !this.artifact) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster
      .intersectObject(this.root, true)
      .find((entry) => (entry.object as THREE.Mesh).isMesh);
    const region =
      !hit || typeof hit.faceIndex !== 'number'
        ? undefined
        : regionForFace(this.artifact.regions, hit.object.name, hit.faceIndex);
    if (region?.id !== this.active?.id) {
      if (this.active) this.emit('region-leave', this.active);
      this.active = region;
      if (region) {
        this.showHighlight(region, hit!.object as THREE.Mesh);
        this.emit('region-enter', region);
      } else this.clearHighlight();
    }
    if (select && region) this.emit('region-select', region);
  }
  private clearHighlight() {
    this.highlight?.removeFromParent();
    this.highlight?.geometry.dispose();
    (this.highlight?.material as THREE.Material | undefined)?.dispose();
    this.highlight = undefined;
    this.render();
  }
  private showHighlight(region: SpatialRegion, mesh: THREE.Mesh) {
    this.clearHighlight();
    if (region.selector.type === 'triangles') {
      this.highlight = overlayFor(mesh, region.selector.faces);
      mesh.add(this.highlight);
      this.render();
    }
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }
}

export class SpatialArtefactElement extends HTMLElement {
  private viewer?: SpatialViewer;
  static get observedAttributes() {
    return ['src'];
  }
  connectedCallback() {
    this.style.display = 'block';
    this.style.minHeight ||= '280px';
    this.viewer = new SpatialViewer(this);
    for (const name of ['region-enter', 'region-leave', 'region-select'] as ViewerEvent[])
      this.viewer.on(name, (region) => {
        if (name === 'region-enter') this.dataset.activeRegion = region.id;
        if (name === 'region-leave') delete this.dataset.activeRegion;
        this.dispatchEvent(new CustomEvent(name, { detail: region, bubbles: true }));
      });
    void this.load();
  }
  disconnectedCallback() {
    this.viewer?.dispose();
  }
  attributeChangedCallback() {
    void this.load();
  }
  private async load() {
    const src = this.getAttribute('src');
    if (!src || !this.viewer || !this.isConnected) return;
    try {
      await this.viewer.load(src);
    } catch (error) {
      this.dispatchEvent(new CustomEvent('spatial-error', { detail: error }));
    }
  }
}
if (!customElements.get('spatial-artefact'))
  customElements.define('spatial-artefact', SpatialArtefactElement);
