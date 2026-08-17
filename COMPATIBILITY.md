# Spatial Artefact V0.1 compatibility

Supported payload: glTF 2.0 binary / GLB. Supported selectors: `node`, `primitive`, and `triangles`. Three.js is the reference runtime, not a format requirement. SHA-256 payload integrity is optional but strongly recommended; missing integrity remains backward compatible, a mismatch is a load error. Finalize and optimize the GLB before mapping, never after. The browser model is local-first and client-side.
