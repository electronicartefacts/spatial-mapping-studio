import type { SpatialRegion } from '@electronic-artefacts/spatial-artefact-schema';

export function regionForFace(
  regions: SpatialRegion[],
  meshName: string,
  faceIndex: number,
): SpatialRegion | undefined {
  return regions.find((region) => {
    const selector = region.selector;
    if (selector.type === 'node') return selector.node === meshName;
    if (selector.type === 'primitive') return selector.mesh === meshName;
    return selector.mesh === meshName && selector.faces.includes(faceIndex);
  });
}
