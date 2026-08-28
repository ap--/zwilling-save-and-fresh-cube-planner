import { describe, expect, it } from 'vitest';
import { BOX_BY_ID, boxesOfHeight } from '../data/catalog';
import { packLayer } from './pack';
import type { Objective } from './types';

const H = 7.6; // S / M / L live at this height step
const flat = boxesOfHeight(H);

function totals(placements: { skuId: string }[]) {
  let cap = 0;
  let price = 0;
  for (const p of placements) {
    const sku = BOX_BY_ID.get(p.skuId)!;
    cap += sku.capacityL;
    price += sku.priceEur;
  }
  return { cap: Number(cap.toFixed(4)), price: Number(price.toFixed(2)), count: placements.length };
}

/** Independent exhaustive search used to confirm the DP really is optimal. */
function bruteForce(gw: number, gd: number, objective: Objective) {
  const options = flat.flatMap((sku) =>
    sku.w === sku.d
      ? [{ sku, w: sku.w, d: sku.d }]
      : [
          { sku, w: sku.w, d: sku.d },
          { sku, w: sku.d, d: sku.w },
        ],
  );
  const grid = Array.from({ length: gd }, () => new Array<boolean>(gw).fill(false));
  let best: { cap: number; price: number; count: number } | null = null;

  const rank = (s: { cap: number; price: number; count: number }) =>
    objective === 'volume'
      ? [-s.cap, s.price, s.count]
      : objective === 'price'
        ? [s.price, -s.cap, s.count]
        : [s.count, -s.cap, s.price];

  const isBetter = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) {
      const diff = a[i]! - b[i]!;
      if (Math.abs(diff) > 1e-9) return diff < 0;
    }
    return false;
  };

  function recurse(acc: { cap: number; price: number; count: number }) {
    let fr = -1;
    let fc = -1;
    outer: for (let r = 0; r < gd; r++) {
      for (let c = 0; c < gw; c++) {
        if (!grid[r]![c]) {
          fr = r;
          fc = c;
          break outer;
        }
      }
    }
    if (fr === -1) {
      if (!best || isBetter(rank(acc), rank(best))) best = { ...acc };
      return;
    }
    for (const o of options) {
      if (fc + o.w > gw || fr + o.d > gd) continue;
      let free = true;
      for (let r = fr; r < fr + o.d && free; r++)
        for (let c = fc; c < fc + o.w; c++) if (grid[r]![c]) { free = false; break; }
      if (!free) continue;
      for (let r = fr; r < fr + o.d; r++) for (let c = fc; c < fc + o.w; c++) grid[r]![c] = true;
      recurse({
        cap: acc.cap + o.sku.capacityL,
        price: acc.price + o.sku.priceEur,
        count: acc.count + 1,
      });
      for (let r = fr; r < fr + o.d; r++) for (let c = fc; c < fc + o.w; c++) grid[r]![c] = false;
    }
  }

  recurse({ cap: 0, price: 0, count: 0 });
  return best as { cap: number; price: number; count: number } | null;
}

describe('packLayer', () => {
  it('fills a 1x1 grid with a single S box', () => {
    const r = packLayer(1, 1, flat, 'volume')!;
    expect(r.placements).toHaveLength(1);
    expect(r.placements[0]!.skuId).toBe('S');
  });

  it('prefers one L over two M or four S on a 2x2 grid', () => {
    for (const objective of ['volume', 'price', 'count'] as Objective[]) {
      const r = packLayer(2, 2, flat, objective)!;
      expect(r.placements.map((p) => p.skuId)).toEqual(['L']);
      expect(r.priceEur).toBeCloseTo(29.95, 2);
      expect(r.capacityL).toBeCloseTo(1.6, 3);
    }
  });

  it('rotates an M to fill a 1x2 grid', () => {
    const r = packLayer(1, 2, flat, 'volume')!;
    expect(r.placements).toHaveLength(1);
    expect(r.placements[0]!.skuId).toBe('M');
    expect(r.placements[0]!.rotated).toBe(true);
  });

  it('solves a 3x2 grid as one L plus one M', () => {
    const r = packLayer(2, 3, flat, 'volume')!;
    expect(r.count).toBe(2);
    expect(r.capacityL).toBeCloseTo(2.3, 3);
    expect(r.priceEur).toBeCloseTo(49.9, 2);
  });

  it('covers every cell exactly once', () => {
    for (let gw = 1; gw <= 4; gw++) {
      for (let gd = 1; gd <= 4; gd++) {
        const r = packLayer(gw, gd, flat, 'volume')!;
        const seen = new Set<string>();
        for (const p of r.placements) {
          for (let y = p.y; y < p.y + p.d; y++) {
            for (let x = p.x; x < p.x + p.w; x++) {
              expect(x).toBeLessThan(gw);
              expect(y).toBeLessThan(gd);
              expect(seen.has(`${x},${y}`)).toBe(false);
              seen.add(`${x},${y}`);
            }
          }
        }
        expect(seen.size).toBe(gw * gd);
      }
    }
  });

  it('matches an exhaustive search for every objective on small grids', () => {
    for (const objective of ['volume', 'price', 'count'] as Objective[]) {
      for (let gw = 1; gw <= 3; gw++) {
        for (let gd = 1; gd <= 4; gd++) {
          const dp = packLayer(gw, gd, flat, objective)!;
          const bf = bruteForce(gw, gd, objective)!;
          const got = totals(dp.placements);
          expect(got.cap, `${objective} ${gw}x${gd} capacity`).toBeCloseTo(bf.cap, 4);
          expect(got.price, `${objective} ${gw}x${gd} price`).toBeCloseTo(bf.price, 2);
          expect(got.count, `${objective} ${gw}x${gd} count`).toBe(bf.count);
        }
      }
    }
  });

  it('returns an empty result for a zero-sized grid', () => {
    expect(packLayer(0, 5, flat, 'volume')).toEqual({
      placements: [],
      capacityL: 0,
      priceEur: 0,
      count: 0,
    });
  });

  it('returns null when the available footprints cannot tile the grid', () => {
    const onlyM = flat.filter((b) => b.id === 'M');
    expect(packLayer(3, 1, onlyM, 'volume')).toBeNull();
  });
});
