export const SpatialArtefactErrorCodes = [
  'INVALID_MANIFEST',
  'UNSUPPORTED_SPEC_VERSION',
  'PAYLOAD_NOT_FOUND',
  'PAYLOAD_INTEGRITY_MISMATCH',
  'SELECTOR_TARGET_NOT_FOUND',
  'SELECTOR_OUT_OF_BOUNDS',
  'GLB_PARSE_ERROR',
] as const;
export type SpatialArtefactErrorCode = (typeof SpatialArtefactErrorCodes)[number];
export class SpatialArtefactError extends Error {
  constructor(
    readonly code: SpatialArtefactErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SpatialArtefactError';
  }
}
export class SpatialPayloadIntegrityError extends SpatialArtefactError {
  constructor() {
    super(
      'PAYLOAD_INTEGRITY_MISMATCH',
      'The model differs from the payload used to create this Spatial Artefact.',
    );
    this.name = 'SpatialPayloadIntegrityError';
  }
}
