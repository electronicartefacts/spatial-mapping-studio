import { describe, expect, it } from 'vitest';
import { sha256 } from './integrity.js';
describe('sha256', () => {
  it('hashes exact bytes', async () =>
    expect(await sha256(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ));
});
