# Spatial Mapping Studio

**Turn surfaces into interfaces.**

Spatial Mapping Studio is an open-source, browser-native, local-first authoring tool for **Spatial Artefacts**: a standard GLB plus a portable semantic manifest. No account, upload, server, or cloud dependency is required.

## What it is

Open a GLB, select triangles, name and tag a region, then export `artifact.json`. The paired Spatial Viewer resolves the regions at hover and click time. Your files stay on your device.

## Run

```sh
pnpm install
pnpm dev:mapper
pnpm dev:demo
```

`pnpm validate` runs linting, formatting, unit tests, and production builds.

## Create an artefact

1. Open a GLB in the Mapper.
2. In **Select**, click surfaces to collect faces.
3. In **Describe**, provide an ID, label, and tags.
4. Save the region and export `artifact.json` beside the original file as `model.glb`.

The V0 artefact is a folder:

```text
hammer/
  artifact.json
  model.glb
```

## Embed

```html
<script type="module" src="/spatial-viewer.js"></script>
<spatial-artefact src="./hammer/artifact.json"></spatial-artefact>
```

Listen for `region-enter`, `region-leave`, and `region-select` events on the element.

## Architecture and roadmap

The portable schema is independent of Three.js; the Viewer and Mapper are reference implementations. See [ARCHITECTURE.md](ARCHITECTURE.md), [the V0 specification](spec/spatial-artefact/0.1.md), and [ADRs](docs/adr/). V0 intentionally stops at triangle mapping; cloud, AI segmentation, Forge, VAST integration, and advanced shaders are out of scope.

## Triangle stability

Triangle selectors refer to indices in the final GLB. Run the pipeline **RAW → Forge → cleanup → optimization → FINAL GLB → Spatial Mapping Studio**. Do not run an operation that changes topology or triangle order after mapping. See ADR 0005.

## Why payload integrity matters

V0.1 can record SHA-256 of the exact GLB bytes. The Viewer refuses a changed model rather than applying triangle regions to incompatible geometry.
