import {
  connectedComponent,
  createTopologyIndex,
  growSelection,
  shrinkSelection,
  type TopologyIndex,
} from '@electronic-artefacts/spatial-project-core';
import type { ComputeRequest, ComputeResponse } from './protocol';

const geometry = new Map<string, { positions: Float32Array; indices: Uint32Array }>();
const topology = new Map<string, TopologyIndex>();
const respond = (message: ComputeResponse) => postMessage(message);

function trianglesFor(value: { positions: Float32Array; indices: Uint32Array }) {
  const faces: string[][] = [];
  for (let face = 0; face < value.indices.length / 3; face += 1) {
    faces.push([0, 1, 2].map((offset) => `index:${value.indices[face * 3 + offset]}`));
  }
  return faces;
}

self.onmessage = ({ data }: MessageEvent<ComputeRequest>) => {
  const started = performance.now();
  try {
    if (data.type === 'register') {
      geometry.set(data.geometry.primitiveId, data.geometry);
      topology.delete(data.geometry.primitiveId);
      respond({ type: 'registered', requestId: data.requestId });
      return;
    }
    if (data.type === 'dispose') {
      if (data.primitiveId) {
        geometry.delete(data.primitiveId);
        topology.delete(data.primitiveId);
      } else {
        geometry.clear();
        topology.clear();
      }
      respond({ type: 'disposed', requestId: data.requestId });
      return;
    }
    const primitive = geometry.get(data.primitiveId);
    if (!primitive) throw new Error('Compute geometry is unavailable.');
    if (data.type === 'build-topology') {
      topology.set(data.primitiveId, createTopologyIndex(trianglesFor(primitive)));
      respond({
        type: 'topology-ready',
        requestId: data.requestId,
        primitiveId: data.primitiveId,
        wallMs: performance.now() - started,
      });
      return;
    }
    if (data.type === 'brush') {
      const faces: number[] = [];
      const multiply = (matrix: number[], x: number, y: number, z: number, w: number) => [
        matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]! * w,
        matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]! * w,
        matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]! * w,
        matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]! * w,
      ];
      for (let face = 0; face < primitive.indices.length / 3; face += 1) {
        let x = 0,
          y = 0,
          z = 0;
        for (let point = 0; point < 3; point += 1) {
          const vertex = primitive.indices[face * 3 + point]! * 3;
          x += primitive.positions[vertex]!;
          y += primitive.positions[vertex + 1]!;
          z += primitive.positions[vertex + 2]!;
        }
        const world = multiply(data.model, x / 3, y / 3, z / 3, 1);
        const clip = multiply(data.viewProjection, world[0]!, world[1]!, world[2]!, world[3]!);
        const px = ((clip[0]! / clip[3]! + 1) / 2) * data.viewport[0]!;
        const py = ((1 - clip[1]! / clip[3]!) / 2) * data.viewport[1]!;
        if (Math.hypot(data.pointer[0]! - px, data.pointer[1]! - py) <= data.radius)
          faces.push(face);
      }
      respond({
        type: 'faces',
        requestId: data.requestId,
        faces,
        wallMs: performance.now() - started,
      });
      return;
    }
    const index = topology.get(data.primitiveId);
    if (!index) throw new Error('Topology is still preparing.');
    const faces =
      data.type === 'connected'
        ? connectedComponent(index, data.seed)
        : data.type === 'grow'
          ? growSelection(index, data.faces)
          : shrinkSelection(index, data.faces);
    respond({
      type: 'faces',
      requestId: data.requestId,
      faces,
      wallMs: performance.now() - started,
    });
  } catch (error) {
    respond({
      type: 'error',
      requestId: data.requestId,
      message: error instanceof Error ? error.message : 'Compute processing failed.',
    });
  }
};
