# 0009 — SelectionSet as authoring source of truth

## Status

Accepted.

## Context

The Mapper originally held selected faces in a Three.js `Map` and used it to build overlays. That created a second, non-undoable selection state beside `WorkspaceProject`.

## Decision

`WorkspaceProject.SelectionSet`, referenced by `activeSelectionId`, is the canonical authoring selection. The Mapper's SelectionController translates raycast results into project commands. SelectionOverlayRenderer receives the active SelectionSet and only projects it into Three.js geometry.

## Consequences

Undo/redo updates the visible highlight by rebuilding the overlay from project state. Regions are created from SelectionSet targets, not from scene objects. Three.js remains outside spatial-project-core and the public Spatial Artefact 0.1 manifest remains unchanged.
