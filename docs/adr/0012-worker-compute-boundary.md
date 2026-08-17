# 0012 — Worker compute boundary

Status: accepted

CPU-heavy authoring geometry computation runs behind an asynchronous `SpatialComputeClient` boundary. The Worker receives compact typed geometry copies keyed by canonical primitive ID and owns topology/query state.

This keeps rendering, camera input, basic selection and project editing responsive while advanced topology becomes ready. It adds typed protocol, lifecycle and stale-result management, but does not change Spatial Artefact 0.1 or introduce a renderer dependency into the compute protocol.
