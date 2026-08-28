import { describe, expect, it } from 'vitest';
import { levelsOf, topOf } from './edit';
import { solveSpace } from './solve';
import type { Space } from './types';

const space = (over: Partial<Space>): Space => ({
  id: 's1',
  name: 'test',
  kind: 'drawer',
  widthCm: 100,
  depthCm: 50,
  heightCm: 20,
  marginCm: 0,
  ...over,
});

describe('solveSpace', () => {
  it('uses a single 7.6 cm layer in a shallow drawer', () => {
    const plan = solveSpace(space({ widthCm: 76, depthCm: 47, heightCm: 12 }), 'volume');
    expect(plan.gridW).toBe(7);
    expect(plan.gridD).toBe(4);
    expect(levelsOf(plan.placements)).toEqual([0]);
    expect(plan.usedHeightCm).toBeCloseTo(7.6, 3);
  });

  it('stacks two 15.2 cm layers of 2L in a 34 cm tall 2x2 shelf', () => {
    const plan = solveSpace(space({ widthCm: 21.4, depthCm: 21.4, heightCm: 34 }), 'volume');
    expect(levelsOf(plan.placements)).toEqual([0, 15.2]);
    expect(plan.counts).toEqual({ '2L': 2 });
    expect(plan.capacityL).toBeCloseTo(8.8, 3);
    expect(plan.usedHeightCm).toBeCloseTo(30.4, 3);
    expect(plan.wastedHeightCm).toBeCloseTo(3.6, 3);
  });

  it('never overflows the space', () => {
    for (const heightCm of [5, 8, 16, 23, 30, 34, 45, 60]) {
      const plan = solveSpace(space({ heightCm }), 'volume');
      expect(plan.usedHeightCm).toBeLessThanOrEqual(heightCm + 1e-9);
      for (const p of plan.placements) expect(topOf(p)).toBeLessThanOrEqual(heightCm + 1e-9);
    }
  });

  it('returns an empty plan when the space is too small for one cell', () => {
    const plan = solveSpace(space({ widthCm: 9, depthCm: 9, heightCm: 20 }), 'volume');
    expect(plan.placements).toEqual([]);
    expect(plan.boxCount).toBe(0);
  });

  it('returns an empty plan when the space is shorter than the smallest box', () => {
    const plan = solveSpace(space({ heightCm: 5 }), 'volume');
    expect(plan.placements).toEqual([]);
  });

  it('applies the clearance margin to all dimensions', () => {
    const tight = solveSpace(space({ widthCm: 21.4, depthCm: 21.4, marginCm: 1 }), 'volume');
    expect(tight.gridW).toBe(1);
    expect(tight.gridD).toBe(1);
  });

  it('agrees with the per-box counts', () => {
    const plan = solveSpace(space({ widthCm: 64, depthCm: 43, heightCm: 32 }), 'volume');
    const tally: Record<string, number> = {};
    for (const p of plan.placements) tally[p.skuId] = (tally[p.skuId] ?? 0) + 1;
    expect(tally).toEqual(plan.counts);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(plan.boxCount);
  });

  it('never spends more under the price objective than under the volume objective', () => {
    const s = space({ widthCm: 80, depthCm: 45, heightCm: 30 });
    expect(solveSpace(s, 'price').priceEur).toBeLessThanOrEqual(
      solveSpace(s, 'volume').priceEur + 1e-9,
    );
    expect(solveSpace(s, 'count').boxCount).toBeLessThanOrEqual(
      solveSpace(s, 'volume').boxCount,
    );
  });
});
