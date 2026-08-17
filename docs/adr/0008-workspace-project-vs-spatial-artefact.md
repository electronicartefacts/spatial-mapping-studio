# ADR 0008: Separate WorkspaceProject from Spatial Artefact

## Context

Spatial Mapping Studio is becoming an authoring environment rather than only a manifest producer.

## Decision

WorkspaceProject is an internal, mutable model with selections, editor state and command history. A deterministic compiler produces the portable Spatial Artefact V0.1.

## Consequences

The authoring model can evolve without changing the public artefact contract. Workspace snapshots are not a public format.
