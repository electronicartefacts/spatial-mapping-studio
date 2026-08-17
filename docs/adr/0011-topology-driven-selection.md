# 0011 — Topology-driven selection

## Status

Accepted.

## Decision

Advanced selection operates on canonical primitive-scoped topology. Two triangles are adjacent only when they share a complete edge. Runtime Three.js objects provide geometry, but never selection identity.

## Consequences

Connected, Grow and Shrink remain within a primitive. Indexed geometry uses exact index edges; non-indexed geometry uses exact position keys without hidden welding. Brush commits one SelectionSet command per stroke. Lasso is deferred until visible-geometry occlusion can be guaranteed.
