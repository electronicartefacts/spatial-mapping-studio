import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Use URL-safe IDs.');
const semver = z.string().regex(/^0\.1\.\d+$/, 'Only Spatial Artefact 0.1.x is supported.');

export const SpatialMetadataSchema = z.object({
  id: identifier,
  title: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  triangleMapping: z.object({ finalGlb: z.literal(true) }).optional(),
});

export const NodeSelectorSchema = z.object({ type: z.literal('node'), node: z.string().min(1) });
export const PrimitiveSelectorSchema = z.object({
  type: z.literal('primitive'),
  mesh: z.string().min(1),
  primitive: z.number().int().nonnegative(),
});
export const TriangleSelectorSchema = z.object({
  type: z.literal('triangles'),
  mesh: z.string().min(1),
  faces: z.array(z.number().int().nonnegative()).min(1).max(100_000),
});
export const SpatialSelectorSchema = z.discriminatedUnion('type', [
  NodeSelectorSchema,
  PrimitiveSelectorSchema,
  TriangleSelectorSchema,
]);

export const SpatialRegionSchema = z.object({
  id: identifier,
  label: z.string().min(1).max(256),
  tags: z.array(z.string().min(1).max(64)).max(32).default([]),
  selector: SpatialSelectorSchema,
});

export const SpatialPayloadSchema = z.object({
  type: z.literal('model/gltf-binary'),
  src: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => !/^(https?:|javascript:|data:)/i.test(value), {
      message: 'Payload must be a relative local path.',
    }),
  integrity: z
    .object({ algorithm: z.literal('sha256'), hash: z.string().min(1).max(128) })
    .optional(),
});

export const SpatialArtefactSchema = z
  .object({
    artifact: z.literal('spatial'),
    specVersion: semver,
    metadata: SpatialMetadataSchema,
    payload: SpatialPayloadSchema,
    regions: z.array(SpatialRegionSchema).max(10_000),
  })
  .superRefine((artifact, context) => {
    const seen = new Set<string>();
    for (const [index, region] of artifact.regions.entries()) {
      if (seen.has(region.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['regions', index, 'id'],
          message: 'Region IDs must be unique.',
        });
      seen.add(region.id);
    }
  });

export type SpatialArtefact = z.infer<typeof SpatialArtefactSchema>;
export type SpatialPayload = z.infer<typeof SpatialPayloadSchema>;
export type SpatialRegion = z.infer<typeof SpatialRegionSchema>;
export type SpatialSelector = z.infer<typeof SpatialSelectorSchema>;
export type SpatialMetadata = z.infer<typeof SpatialMetadataSchema>;

export function parseSpatialArtefact(input: unknown): SpatialArtefact {
  return SpatialArtefactSchema.parse(input);
}
export function safeParseSpatialArtefact(input: unknown) {
  return SpatialArtefactSchema.safeParse(input);
}
