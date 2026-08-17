# Performance

## Methodology

`pnpm benchmark` is a manual, local-only topology benchmark. It generates regular synthetic triangle grids in memory and measures topology build, connected traversal, grow and shrink with `performance.now()`. It does not run in standard CI and sends no telemetry.

The browser measurements still required for a target device are: file read, SHA-256, GLB parsing, runtime mapping, first render, raycast/brush latency, overlay rebuild and export. Large local scans belong in ignored `benchmarks/local/`.

## Initial budgets

These are development budgets, to be revised from the command output on the target machine:

| Class      | Triangle count |                   Expected topology build |
| ---------- | -------------: | ----------------------------------------: |
| Small      |      up to 10k |                interactive on main thread |
| Medium     |      up to 50k |      interactive with a brief import step |
| Large      |     up to 100k |     warn if an interaction exceeds 100 ms |
| Very large |     above 100k | benchmark before promising responsiveness |

## Reference run

Local Node.js reference run (August 2026, synthetic regular grids):

| Triangles | Topology build | Connected |    Grow |   Shrink |
| --------: | -------------: | --------: | ------: | -------: |
|       10k |       14.85 ms |   2.10 ms | 0.04 ms |  1.47 ms |
|       50k |       67.33 ms |   8.95 ms | 0.01 ms |  6.28 ms |
|      100k |      126.84 ms |  21.18 ms | 0.02 ms | 14.02 ms |

These figures are a local reference, not a mobile guarantee. They identify topology construction as the only operation exceeding a 100 ms interaction budget at 100k triangles.

## Decisions

BVH is deferred: this harness does not measure raycast latency, which is its relevant decision gate. Workers are deferred: the measured pure topology operations remain synchronous until a representative model shows UI blocking. The principal memory copies are source bytes, GLTFLoader buffers, topology arrays, and temporary overlay geometry.
