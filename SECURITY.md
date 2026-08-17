# Security policy

Treat GLB files and `artifact.json` files as untrusted input. The applications validate manifests before use, never execute manifest code, and render text with DOM text nodes rather than HTML injection.

Please report vulnerabilities privately to the maintainers before opening a public issue. The V0 viewer only resolves payload paths relative to the manifest URL; it does not fetch arbitrary code or execute external URLs.
