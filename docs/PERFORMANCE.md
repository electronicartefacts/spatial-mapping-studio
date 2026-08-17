# Performance baseline — Milestone 7

This is a measured V0.2 authoring baseline, not a device guarantee. The benchmark uses deterministic indexed grid GLBs generated locally by `scripts/generate-browser-benchmarks.mjs`; the generated files are ignored and never shipped. Measurements were taken in production-build Playwright Chromium on the project workstation, 17 August 2026. Each cold metric has three runs and reports median/p95; warm interactions have 4–9 runs where appropriate.

`pnpm benchmark:browser:full` is the reference command. `pnpm benchmark:browser:dev` is a debugging comparison only. It exercises the actual import path: file availability, SHA-256, `GltfImporter`, `GLTFLoader`, canonical-to-runtime mapping, `TopologyIndex`, Three.js scene attachment and first scheduled render. All data stays local.

## Production desktop matrix

| Triangles |      GLB |   TTI median / p95 | GLTF parse median / p95 | Runtime mapping / topology median / p95 | Raycast median / p95 |
| --------: | -------: | -----------------: | ----------------------: | --------------------------------------: | -------------------: |
|       10k | 0.17 MiB |   63.17 / 63.17 ms |          3.60 / 3.60 ms |                        10.30 / 10.30 ms |       0.80 / 1.20 ms |
|       50k | 0.86 MiB |   94.56 / 94.56 ms |          2.30 / 2.30 ms |                        41.30 / 41.30 ms |       2.50 / 2.60 ms |
|      100k | 1.72 MiB | 131.82 / 131.82 ms |          3.60 / 3.60 ms |                        75.20 / 75.20 ms |       3.90 / 4.40 ms |
|      250k | 4.30 MiB | 460.24 / 460.24 ms |          7.50 / 7.50 ms |                      225.70 / 225.70 ms |      9.40 / 10.00 ms |
|      500k | 8.60 MiB | 848.10 / 848.10 ms |        12.90 / 12.90 ms |                      521.60 / 521.60 ms |     18.00 / 18.20 ms |

File read and canonical manifest import were below 4 ms and 0.1 ms respectively in this synthetic single-primitive matrix. They are not the bottleneck. The TTI is a cold metric; raycast is a warm in-canvas `THREE.Raycaster` measurement and excludes initial loading.

The dev comparison is intentionally not the decision reference. Its 10k/100k/500k TTI medians were 66.22/139.18/829.14 ms, close on this workstation but subject to Vite/HMR variance.

## Brush and overlay scaling

The current Brush candidate scan projects every triangle centroid, so radius changes the selected result but not its O(n) scan. This is deliberate measurement of the present implementation, not a recommendation.

| Model |                Radius |                                   candidate scan median / p95 |
| ----: | --------------------: | ------------------------------------------------------------: |
|   10k | 16 / 36 / 72 / 120 px |         1.70 / 3.40, 1.10 / 1.20, 1.00 / 1.00, 1.00 / 1.10 ms |
|  100k | 16 / 36 / 72 / 120 px | 10.70 / 11.10, 10.90 / 11.00, 10.90 / 11.10, 10.90 / 11.10 ms |
|  500k | 16 / 36 / 72 / 120 px | 56.30 / 57.20, 55.60 / 56.10, 56.20 / 56.40, 56.40 / 56.70 ms |

Overlay geometry construction was measured independently after the model was warm. At a real 100k-face selection it took 4.5 ms on a 100k model and 6.3 ms on a 500k model. It is comfortable below 10k selected faces, large but still acceptable through 50k, and becomes interaction-sensitive at 100k once allocation, render upload and drawing are included. An exploratory full 500k-face visible overlay saturated the headless SwiftShader GPU and did not reach a useful interactive state; this is a GPU/render limit, not evidence that the 6.3 ms CPU rebuild is sufficient.

## Format scaling and export

`artifact.json` triangle selector scaling is linear for the current readable JSON representation.

| Selected faces | JSON bytes | JSON serialization median / p95 |
| -------------: | ---------: | ------------------------------: |
|             1k |      4,327 |                  0.01 / 0.01 ms |
|            10k |     49,329 |                  0.09 / 0.09 ms |
|            50k |    289,329 |                  0.46 / 0.51 ms |
|           100k |    589,331 |                  0.94 / 0.99 ms |

1k–10k is comfortable; 50k is large but acceptable for an explicit local export; 100k is problematic primarily for portability, reviewability and future payload size rather than serialization latency. The benchmark measures compiler-to-JSON preparation; browser download is a Blob handoff and was not material at these sizes.

## Mobile and long tasks

Mobile Chromium emulation (390 × 844, production build) measured 10k at 139.26 ms TTI / 10.10 ms topology and 100k at 126.61 ms TTI / 80.60 ms topology. This is an emulation, not a physical-device certification. The desktop run recorded a 258 ms median/p95 long task, consistent with synchronous topology construction during the large cold-load sequence.

## Performance classes and decisions

| Class | Triangle range | V0.2 guidance                                                                                                            |
| ----- | -------------: | ------------------------------------------------------------------------------------------------------------------------ |
| S     |         <= 50k | Full authoring, brush and overlays comfortable.                                                                          |
| M     |        <= 100k | Recommended editing target on desktop Chromium; mobile should remain near this ceiling.                                  |
| L     |      100k–250k | Inspection and bounded selections are usable; cold topology and broad brush are perceptible.                             |
| XL    |      250k–500k | Inspection/raycast remains possible; not a comfortable general authoring target without the next optimisation milestone. |

Observed cost ranking:

1. **Topology build** — CPU authoring; 521.6 ms at 500k and the principal cold-load long task.
2. **Brush candidate scan** — CPU authoring; 56.3 ms median at 500k regardless of radius.
3. **Visible large overlay draw/upload** — GPU/render; CPU rebuild is modest, but a fully visible 500k overlay is not viable in the headless renderer.
4. **Raycast** — CPU authoring; 18.2 ms p95 at 500k, acceptable for inspection but no longer a 60fps budget.
5. **Triangle-selector export** — serialization/format scaling; sub-millisecond at 100k, but 589 KB makes the manifest less portable.

**Decision:** do not add BVH, Workers, a different selector or an overlay optimisation during this discovery milestone. For Milestone 8, first move topology construction and brush candidate work off the interaction path (Worker/transferable design), then evaluate a spatial acceleration structure against the same fixtures. Keep Spatial Artefact 0.1 unchanged; start a separate format-evolution investigation only when real projects regularly exceed roughly 50k selected faces.
