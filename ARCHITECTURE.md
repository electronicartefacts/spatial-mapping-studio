# Architecture

`spatial-artefact-schema` is the portable format boundary. `spatial-project-core` is the framework-free, mutable authoring model: it owns WorkspaceProject, SelectionSets, commands, history, snapshots, and the deterministic compiler. `spatial-viewer` is a framework-free Three.js reference implementation and Custom Element.

`spatial-importers` is the renderer-agnostic ingestion boundary. Its GLB reference importer reads the source JSON chunk to derive structural scene, node, mesh, primitive, and material identifiers without rewriting payload bytes. The Mapper's ModelController maps these canonical identities to temporary Three.js objects using GLTFLoader associations.

```text
GLB → WorkspaceProject → Commands / History → SelectionSets / EditableRegions → Spatial Artefact Compiler → Spatial Artefact → Spatial Viewer
```

WorkspaceProject is internal and mutable; it may hold editor state, drafts, and history. Spatial Artefact is portable and contains only final semantic regions, payload and integrity. Workspace snapshots are internal persistence, not a public specification.

Selection is a project concern, not a Three.js concern. The active `SelectionSet` is the only durable selection state; its yellow overlay is rebuilt after every command, undo and redo.

```text
            AUTHORING
Source File
    ↓
Importer
    ↓
CanonicalModel
    ↓
Three Runtime Adapter
    ↓
SelectionController
    ↓
WorkspaceProject
    ↓
Compiler
            PORTABLE
Spatial Artefact
    ↓
Spatial Viewer
```

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

Creating a region snapshots the active selection into triangle selectors and deliberately keeps that selection active, so it can be refined or reused. Face, Mesh, Primitive and Material selection are enabled only when their canonical runtime mapping is available; Material selection covers every primitive in the loaded canonical model sharing that material.

## Selection tools

Face toggles a triangle. Mesh, Primitive and Material replace the active SelectionSet from canonical identity. Connected selects the primitive-scoped edge-connected component. Grow adds immediate edge neighbours; Shrink removes selected boundary triangles. Brush and Erase accumulate pointer hits and commit one command per stroke. Lasso is intentionally deferred: V0.2 will not silently select hidden geometry without an explicit visible-geometry occlusion rule.

Topology is exact by default: indexed geometry uses shared index edges and non-indexed geometry uses exact matching positions. No weld tolerance is applied implicitly. The runtime fixtures are intentionally tiny; no measured workload currently justifies BVH.

## Supported inputs

| Input                        | Status                                               |
| ---------------------------- | ---------------------------------------------------- |
| GLB 2.0                      | Supported by `GltfImporter`; bytes remain unchanged. |
| glTF with external resources | Not yet supported.                                   |
| OBJ / STL / PLY              | Future importers.                                    |
| FBX                          | Not planned for this milestone.                      |

Here, “normalized GLB” means a valid import with stable canonical identities and a consistent runtime mapping. It does not mean retopology, simplification, compression, or a Forge transformation. Forge may produce a final GLB before import, but it is never a Studio dependency.

Three.js is an implementation detail: manifests contain glTF-oriented semantic selectors, never Three.js UUIDs. Core capability is WebGL2/WebGL; enhanced paths may add WebGPU, OPFS, workers, and File System Access without becoming required.

The V0 runtime renders on demand. Files remain in browser memory unless the user explicitly downloads a manifest or project. Local storage is convenience state, not permanent storage.
