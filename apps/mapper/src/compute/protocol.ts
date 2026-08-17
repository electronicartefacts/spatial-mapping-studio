import type { CanonicalPrimitiveId } from '@electronic-artefacts/spatial-importers';

export type ComputePrimitiveGeometry = {
  primitiveId: CanonicalPrimitiveId;
  positions: Float32Array;
  indices: Uint32Array;
};

export type ComputeRequest =
  | { type: 'register'; requestId: number; geometry: ComputePrimitiveGeometry }
  | { type: 'build-topology'; requestId: number; primitiveId: CanonicalPrimitiveId }
  | { type: 'connected'; requestId: number; primitiveId: CanonicalPrimitiveId; seed: number }
  | { type: 'grow'; requestId: number; primitiveId: CanonicalPrimitiveId; faces: number[] }
  | { type: 'shrink'; requestId: number; primitiveId: CanonicalPrimitiveId; faces: number[] }
  | {
      type: 'brush';
      requestId: number;
      primitiveId: CanonicalPrimitiveId;
      pointer: [number, number];
      radius: number;
      viewport: [number, number];
      model: number[];
      viewProjection: number[];
    }
  | {
      type: 'lasso';
      requestId: number;
      primitiveId: CanonicalPrimitiveId;
      polygon: [number, number][];
      viewport: [number, number];
      model: number[];
      viewProjection: number[];
    }
  | { type: 'dispose'; requestId: number; primitiveId?: CanonicalPrimitiveId };

export type ComputeResponse =
  | { type: 'registered'; requestId: number }
  | { type: 'topology-ready'; requestId: number; primitiveId: CanonicalPrimitiveId; wallMs: number }
  | { type: 'faces'; requestId: number; faces: number[]; wallMs: number }
  | { type: 'disposed'; requestId: number }
  | { type: 'error'; requestId: number; message: string };
