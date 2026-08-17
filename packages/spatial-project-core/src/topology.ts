export type TopologyIndex = {
  triangleCount: number;
  neighbors: readonly number[][];
  boundary: readonly boolean[];
};

/** Builds exact edge adjacency. Two triangles are neighbours only when they share an edge. */
export function createTopologyIndex(triangles: readonly (readonly string[])[]): TopologyIndex {
  const neighbors = triangles.map(() => new Set<number>());
  const edges = new Map<string, number[]>();
  triangles.forEach((triangle, triangleIndex) => {
    if (triangle.length !== 3)
      throw new Error('Topology requires exactly three vertices per triangle.');
    for (const [a, b] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ] as [string, string][]) {
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, [...(edges.get(edge) ?? []), triangleIndex]);
    }
  });
  edges.forEach((owners) => {
    if (owners.length < 2) return;
    owners.forEach((owner) =>
      owners.forEach((other) => owner !== other && neighbors[owner]?.add(other)),
    );
  });
  const boundary = triangles.map((_, triangle) =>
    [...edges.values()].some((owners) => owners.length === 1 && owners[0] === triangle),
  );
  return {
    triangleCount: triangles.length,
    neighbors: neighbors.map((items) => [...items].sort((a, b) => a - b)),
    boundary,
  };
}

export function connectedComponent(index: TopologyIndex, seed: number): number[] {
  if (seed < 0 || seed >= index.triangleCount) return [];
  const visited = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const triangle = queue.shift()!;
    index.neighbors[triangle]?.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    });
  }
  return [...visited].sort((a, b) => a - b);
}

export function growSelection(index: TopologyIndex, selected: readonly number[]): number[] {
  const result = new Set(selected);
  selected.forEach((triangle) =>
    index.neighbors[triangle]?.forEach((neighbor) => result.add(neighbor)),
  );
  return [...result].sort((a, b) => a - b);
}

/** Shrink removes triangles on the selected set's outer boundary. */
export function shrinkSelection(index: TopologyIndex, selected: readonly number[]): number[] {
  const selectedSet = new Set(selected);
  return selected.filter(
    (triangle) =>
      !index.boundary[triangle] &&
      (index.neighbors[triangle] ?? []).every((neighbor) => selectedSet.has(neighbor)),
  );
}
