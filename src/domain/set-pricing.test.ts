import { describe, expect, it } from 'vitest';
import { BOXES, SETS } from '../data/catalog';
import { cheapestBasket } from './purchase';
import { solveCheapest, solveSpace } from './solve';
import type { Space } from './types';

const space = (widthCm: number, depthCm: number, heightCm: number): Space => ({
  id: 's',
  name: 's',
  kind: 'shelf',
  widthCm,
  depthCm,
  heightCm,
  marginCm: 0,
});

/** Euro per cell-centimetre — how dearly a box buys the space it occupies. */
const boxRate = (id: string) => {
  const b = BOXES.find((x) => x.id === id)!;
  return b.priceEur / (b.w * b.d * b.heightCm);
};

const setRate = (label: string) => {
  const s = SETS.find((x) => x.label === label)!;
  const cellCm = Object.entries(s.contents).reduce((n, [id, qty]) => {
    const b = BOXES.find((x) => x.id === id)!;
    return n + qty * b.w * b.d * b.heightCm;
  }, 0);
  return s.priceEur / cellCm;
};

const SPACES = [
  space(60, 45, 40),
  space(60, 45, 23),
  space(40, 30, 30),
  space(80, 35, 16),
  space(30, 30, 45),
  space(22, 22, 23),
  space(11, 45, 30),
];

describe('set-aware pricing', () => {
  it('costs no more than the singles-only price plan', () => {
    for (const sp of SPACES) {
      const singles = solveSpace(sp, 'price');
      const cheapest = solveCheapest(sp);
      expect(cheapestBasket(cheapest.counts).totalEur).toBeLessThanOrEqual(
        cheapestBasket(singles.counts).totalEur + 1e-9,
      );
    }
  });

  it('still fills the space as fully as the singles-only price plan', () => {
    for (const sp of SPACES) {
      expect(solveCheapest(sp).usedHeightCm).toBeGreaterThanOrEqual(
        solveSpace(sp, 'price').usedHeightCm - 1e-9,
      );
    }
  });

  it('reports the price objective it was asked for', () => {
    expect(solveCheapest(space(60, 45, 40)).objective).toBe('price');
  });

  it('honours an explicit SKU restriction', () => {
    const plan = solveCheapest(space(60, 45, 23), { allowedSkuIds: ['3S', '3M'] });
    expect(plan.placements.length).toBeGreaterThan(0);
    for (const id of Object.keys(plan.counts)) expect(['3S', '3M']).toContain(id);
  });

  it('falls back to a 1x1 box when the grid has an odd cell out', () => {
    // 5 x 3 cells cannot be tiled by 2-cell boxes alone.
    const plan = solveCheapest(space(60, 35, 23), { allowedSkuIds: ['3S', '3M'] });
    expect(plan.counts['3S']).toBe(1);
    expect(plan.counts['3M']).toBe(7);
  });

  /**
   * Why no set is ever chosen to fill empty storage: you must buy a set whole, so
   * what matters is its blended rate, and every set's is worse than a plain 2L or
   * 3M. If ZWILLING repriced, this is the assertion that would break first.
   */
  it('buys singles because every set is dearer per unit of space', () => {
    const cheapestSingle = Math.min(...BOXES.map((b) => boxRate(b.id)));
    expect(cheapestSingle).toBeCloseTo(boxRate('2L'), 6);
    for (const s of SETS) {
      expect(setRate(s.label), `${s.label} vs 2L`).toBeGreaterThan(cheapestSingle);
    }
  });

  it('leaves the price plan on singles at current prices', () => {
    for (const sp of SPACES) {
      const basket = cheapestBasket(solveCheapest(sp).counts);
      expect(basket.lines.every((l) => l.kind === 'single'), `${sp.widthCm}x${sp.depthCm}`).toBe(
        true,
      );
    }
  });

  it('does pick a set once the plan needs one set-worth of small boxes', () => {
    const basket = cheapestBasket({ S: 1, '2S': 2, '3S': 1 });
    expect(basket.lines.map((l) => l.label)).toEqual(['Set S']);
  });
});
