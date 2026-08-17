# Architecture

`spatial-artefact-schema` is the portable format boundary. `spatial-project-core` is the framework-free, mutable authoring model: it owns WorkspaceProject, SelectionSets, commands, history, snapshots, and the deterministic compiler. `spatial-viewer` is a framework-free Three.js reference implementation and Custom Element.

```text
GLB → WorkspaceProject → Commands / History → SelectionSets / EditableRegions → Spatial Artefact Compiler → Spatial Artefact → Spatial Viewer
```

WorkspaceProject is internal and mutable; it may hold editor state, drafts, and history. Spatial Artefact is portable and contains only final semantic regions, payload and integrity. Workspace snapshots are internal persistence, not a public specification.

Selection is a project concern, not a Three.js concern. The active `SelectionSet` is the only durable selection state; its yellow overlay is rebuilt after every command, undo and redo.

```text
Pointer / Raycast
      ↓
Selection Controller
      ↓
Project Commands
      ↓
WorkspaceProject.SelectionSet
      ↓
Overlay Renderer
```

Creating a region snapshots the active selection into triangle selectors and deliberately keeps that selection active, so it can be refined or reused. The current mapper supports Face and Mesh selection. Primitive and Material controls are explicitly deferred until glTF primitive/material identities can be mapped without heuristic assumptions.

Three.js is an implementation detail: manifests contain glTF-oriented semantic selectors, never Three.js UUIDs. Core capability is WebGL2/WebGL; enhanced paths may add WebGPU, OPFS, workers, and File System Access without becoming required.

The V0 runtime renders on demand. Files remain in browser memory unless the user explicitly downloads a manifest or project. Local storage is convenience state, not permanent storage.
