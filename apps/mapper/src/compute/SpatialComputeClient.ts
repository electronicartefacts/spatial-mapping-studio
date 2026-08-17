import type { CanonicalPrimitiveId } from '@electronic-artefacts/spatial-importers';
import type { ComputePrimitiveGeometry, ComputeRequest, ComputeResponse } from './protocol';

type Pending = { resolve: (value: ComputeResponse) => void; reject: (reason: Error) => void };
type RequestWithoutId = ComputeRequest extends infer Request
  ? Request extends { requestId: number }
    ? Omit<Request, 'requestId'>
    : never
  : never;

/** Renderer-agnostic asynchronous boundary for CPU-heavy authoring computation. */
export class SpatialComputeClient {
  private readonly worker = new Worker(new URL('./spatial-compute.worker.ts', import.meta.url), {
    type: 'module',
  });
  private readonly pending = new Map<number, Pending>();
  private nextRequestId = 1;
  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<ComputeResponse>) => {
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      this.pending.delete(data.requestId);
      if (data.type === 'error') pending.reject(new Error(data.message));
      else pending.resolve(data);
    };
    this.worker.onerror = () => {
      this.pending.forEach(({ reject }) => reject(new Error('Topology processing failed.')));
      this.pending.clear();
    };
  }
  register(geometry: ComputePrimitiveGeometry) {
    return this.request({ type: 'register', geometry }, [
      geometry.positions.buffer,
      geometry.indices.buffer,
    ]);
  }
  buildTopology(primitiveId: CanonicalPrimitiveId) {
    return this.request({ type: 'build-topology', primitiveId });
  }
  connected(primitiveId: CanonicalPrimitiveId, seed: number) {
    return this.faces({ type: 'connected', primitiveId, seed });
  }
  grow(primitiveId: CanonicalPrimitiveId, faces: number[]) {
    return this.faces({ type: 'grow', primitiveId, faces });
  }
  shrink(primitiveId: CanonicalPrimitiveId, faces: number[]) {
    return this.faces({ type: 'shrink', primitiveId, faces });
  }
  brush(
    primitiveId: CanonicalPrimitiveId,
    pointer: [number, number],
    radius: number,
    viewport: [number, number],
    model: number[],
    viewProjection: number[],
  ) {
    return this.faces({
      type: 'brush',
      primitiveId,
      pointer,
      radius,
      viewport,
      model,
      viewProjection,
    });
  }
  dispose() {
    return this.request({ type: 'dispose' });
  }
  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
  private async faces(request: RequestWithoutId) {
    const result = await this.request(request);
    if (result.type !== 'faces') throw new Error('Unexpected compute response.');
    return result;
  }
  private request(request: RequestWithoutId, transfer: Transferable[] = []) {
    const requestId = this.nextRequestId++;
    return new Promise<ComputeResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ ...request, requestId } as ComputeRequest, transfer);
    });
  }
}
