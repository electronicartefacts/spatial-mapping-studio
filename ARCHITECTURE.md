# Architecture

`spatial-artefact-schema` is the portable format boundary. `spatial-viewer` is a framework-free Three.js reference implementation and Custom Element. The Mapper is an authoring application that produces the same manifest consumed by the independent vanilla demo.

Three.js is an implementation detail: manifests contain glTF-oriented semantic selectors, never Three.js UUIDs. Core capability is WebGL2/WebGL; enhanced paths may add WebGPU, OPFS, workers, and File System Access without becoming required.

The V0 runtime renders on demand. Files remain in browser memory unless the user explicitly downloads a manifest or project. Local storage is convenience state, not permanent storage.
