# 0010 — Canonical model identity

## Status

Accepted.

## Context

Three.js UUIDs are recreated on every load and cannot identify a source model persistently. Primitive and material selection require stable identities that survive runtime recreation.

## Decision

For GLB, Spatial Mapping Studio derives canonical IDs from glTF structural indices: `scene:n`, `node:n`, `mesh:n`, `primitive:mesh:primitive`, and `material:n`. `spatial-importers` owns this renderer-agnostic CanonicalModel. ModelController maps those IDs to temporary Three.js objects through GLTFLoader parser associations.

## Consequences

SelectionSet may carry canonical primitive and material IDs while public Spatial Artefact 0.1 remains unchanged. A source GLB is not rewritten on import; integrity remains the SHA-256 of its exact bytes. Unsupported or incomplete runtime mappings become diagnostics rather than fabricated identities.
