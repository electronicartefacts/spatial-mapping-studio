# ADR 0005: Finalize geometry before triangle mapping

**Decision:** V0 maps zero-based face indices of the final GLB. **Consequences:** topology or triangle-order optimization after mapping invalidates regions and must be avoided.
