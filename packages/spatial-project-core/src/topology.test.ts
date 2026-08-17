import { describe, expect, it } from 'vitest';
import {
  connectedComponent,
  createTopologyIndex,
  growSelection,
  shrinkSelection,
} from './topology.js';

describe('TopologyIndex', () => {
  const index = createTopologyIndex([
    ['0', '1', '2'],
    ['2', '1', '3'],
    ['3', '4', '5'],
  ]);
  it('uses complete shared edges, not shared vertices', () => {
    expect(index.neighbors).toEqual([[1], [0], []]);
  });
  it('resolves connected components and grow deterministically', () => {
    expect(connectedComponent(index, 0)).toEqual([0, 1]);
    expect(growSelection(index, [0])).toEqual([0, 1]);
  });
  it('shrinks the selected boundary', () => {
    expect(shrinkSelection(index, [0, 1])).toEqual([]);
  });
});
