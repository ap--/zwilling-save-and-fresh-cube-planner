import { describe, expect, it } from 'vitest';
import {
  canPlace,
  fillEmpty,
  firstFreeSpot,
  isSupported,
  levelsOf,
  otherThan,
  planFrom,
  restHeight,
  settle,
  swapCandidates,
  topOf,
} from './edit';
import type { Placement, Space } from './types';

const space: Space = {
  id: 's1',
  name: 'Drawer',
  kind: 'drawer',
  widthCm: 60,
  depthCm: 45,
  heightCm: 22.8,
  marginCm: 0,
};

const GRID_W = 5;
const GRID_D = 4;
const H = 22.8;

function box(skuId: string, x: number, y: number, w: number, d: number, zCm = 0): Placement {
  return { skuId, x, y, zCm, w, d, rotated: false };
}

describe('restHeight', () => {
  it('rests on the floor when nothing is below', () => {
    expect(restHeight(box('M', 0, 0, 2, 1), [])).toBe(0);
  });

  it('rests on the top of the box below', () => {
    const below = [box('M', 0, 0, 2, 1)]; // 7.6 cm tall
    expect(restHeight(box('M', 0, 0, 2, 1), below)).toBeCloseTo(7.6, 6);
  });

  it('rests on the tallest thing under the footprint', () => {
    const below = [box('M', 0, 0, 2, 1), box('3M', 2, 0, 2, 1)]; // 7.6 and 22.8
    expect(restHeight(box('L', 1, 0, 2, 2), below)).toBeCloseTo(22.8, 6);
  });

  it('ignores boxes that do not overlap the footprint', () => {
    expect(restHeight(box('M', 3, 0, 2, 1), [box('3M', 0, 0, 2, 1)])).toBe(0);
  });
});

describe('canPlace', () => {
  it('rejects a box hanging off the grid', () => {
    expect(canPlace(box('M', 4, 0, 2, 1), [], GRID_W, GRID_D, H)).toBe(false);
    expect(canPlace(box('M', -1, 0, 2, 1), [], GRID_W, GRID_D, H)).toBe(false);
  });

  it('accepts a box stacked squarely on another', () => {
    expect(canPlace(box('M', 0, 0, 2, 1), [box('M', 0, 0, 2, 1)], GRID_W, GRID_D, H)).toBe(true);
  });

  it('rejects a box that would overhang what it sits on', () => {
    // A 2x1 M half on top of a 1x1 S and half over open floor would tip.
    expect(canPlace(box('M', 0, 0, 2, 1), [box('S', 0, 0, 1, 1)], GRID_W, GRID_D, H)).toBe(false);
  });

  it('accepts a box bridging two boxes of equal height', () => {
    const below = [box('S', 0, 0, 1, 1), box('S', 1, 0, 1, 1)];
    expect(canPlace(box('M', 0, 0, 2, 1), below, GRID_W, GRID_D, H)).toBe(true);
  });

  it('rejects a stack that would burst through the ceiling', () => {
    const below = [box('3M', 0, 0, 2, 1)]; // 22.8 fills the space exactly
    expect(canPlace(box('S', 0, 0, 1, 1), below, GRID_W, GRID_D, H)).toBe(false);
  });
});

describe('isSupported', () => {
  it('accepts a box resting flat on another', () => {
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)];
    expect(isSupported(boxes[1]!, otherThan(boxes, 1))).toBe(true);
  });

  it('accepts every box in a three-high stack, including the bottom one', () => {
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6), box('M', 0, 0, 2, 1, 15.2)];
    boxes.forEach((p, i) => expect(isSupported(p, otherThan(boxes, i))).toBe(true));
  });

  it('rejects a box left floating after its support is gone', () => {
    expect(isSupported(box('M', 0, 0, 2, 1, 7.6), [])).toBe(false);
  });

  it('rejects a box half hanging over the edge of its support', () => {
    const boxes = [box('S', 0, 0, 1, 1), box('M', 0, 0, 2, 1, 7.6)];
    expect(isSupported(boxes[1]!, otherThan(boxes, 1))).toBe(false);
  });
});

describe('settle', () => {
  it('drops a floating box to the floor', () => {
    expect(settle([box('M', 0, 0, 2, 1, 15.2)])[0]!.zCm).toBe(0);
  });

  it('keeps a genuine stack intact', () => {
    const settled = settle([box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)]);
    expect(settled.map((p) => p.zCm)).toEqual([0, 7.6]);
  });

  it('collapses a stack when a box below is removed', () => {
    const stack = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6), box('M', 0, 0, 2, 1, 15.2)];
    expect(settle(stack.slice(1)).map((p) => p.zCm)).toEqual([0, 7.6]);
  });

  it('leaves boxes in separate columns on the floor', () => {
    const settled = settle([box('M', 0, 0, 2, 1), box('M', 2, 0, 2, 1)]);
    expect(settled.every((p) => p.zCm === 0)).toBe(true);
  });
});

describe('levelsOf', () => {
  it('lists distinct base heights bottom to top', () => {
    const boxes = [box('M', 0, 0, 2, 1, 7.6), box('M', 0, 0, 2, 1), box('S', 3, 0, 1, 1, 7.6)];
    expect(levelsOf(boxes)).toEqual([0, 7.6]);
  });
});

describe('firstFreeSpot', () => {
  it('puts the first box on the floor', () => {
    expect(firstFreeSpot('M', [], GRID_W, GRID_D, H)?.zCm).toBe(0);
  });

  it('stacks onto existing boxes once the floor is taken', () => {
    const floor = fillEmpty([], GRID_W, GRID_D, 7.6);
    expect(firstFreeSpot('S', floor, GRID_W, GRID_D, H)?.zCm).toBeCloseTo(7.6, 6);
  });

  it('returns null when the space is full to the ceiling', () => {
    const full = fillEmpty([], GRID_W, GRID_D, H);
    expect(firstFreeSpot('S', full, GRID_W, GRID_D, H)).toBeNull();
  });
});

describe('fillEmpty', () => {
  it('covers the whole floor', () => {
    const filled = fillEmpty([], GRID_W, GRID_D, 7.6);
    expect(filled.reduce((n, p) => n + p.w * p.d, 0)).toBe(GRID_W * GRID_D);
  });

  it('stacks to use the full height, not just one layer', () => {
    const filled = fillEmpty([], GRID_W, GRID_D, H);
    expect(levelsOf(filled).length).toBeGreaterThan(1);
    expect(filled.reduce((max, p) => Math.max(max, topOf(p)), 0)).toBeCloseTo(H, 6);
  });

  it('never exceeds the available height', () => {
    for (const p of fillEmpty([], GRID_W, GRID_D, 15.2)) {
      expect(topOf(p)).toBeLessThanOrEqual(15.2 + 1e-6);
    }
  });

  it('leaves existing boxes untouched', () => {
    const existing = [box('3M', 0, 0, 2, 1)];
    expect(fillEmpty(existing, GRID_W, GRID_D, H)).toEqual(expect.arrayContaining(existing));
  });
});

describe('swapCandidates', () => {
  it('offers boxes that land at the same height', () => {
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)];
    const ids = swapCandidates(boxes, 1, GRID_W, GRID_D, H).map((c) => c.sku.id);
    expect(ids).toContain('2M');
  });

  it('will not offer a box that pushes the stack through the ceiling', () => {
    // 7.6 + 7.6 used; a 3M on top would reach 30.4 > 22.8.
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)];
    const ids = swapCandidates(boxes, 1, GRID_W, GRID_D, H).map((c) => c.sku.id);
    expect(ids).not.toContain('3M');
  });

  it('leaves room for whatever is stacked on top', () => {
    // Swapping the bottom M for a 2M lifts the top box to 15.2 (top 22.8) — still fits.
    // A 3M underneath would push it to 30.4 — it must not be offered.
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)];
    const ids = swapCandidates(boxes, 0, GRID_W, GRID_D, H).map((c) => c.sku.id);
    expect(ids).toContain('2M');
    expect(ids).not.toContain('3M');
  });

  it('returns nothing for an index that is not there', () => {
    expect(swapCandidates([], 0, GRID_W, GRID_D, H)).toEqual([]);
  });
});

describe('planFrom', () => {
  it('totals capacity, price and count', () => {
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6)];
    const plan = planFrom(space, boxes, 'volume', GRID_W, GRID_D);
    expect(plan.boxCount).toBe(2);
    expect(plan.counts.M).toBe(2);
    expect(plan.capacityL).toBeCloseTo(1.4, 6);
    expect(plan.priceEur).toBeCloseTo(39.9, 6);
  });

  it('measures used height from the tallest stack', () => {
    const boxes = [box('M', 0, 0, 2, 1), box('M', 0, 0, 2, 1, 7.6), box('S', 4, 3, 1, 1)];
    const plan = planFrom(space, boxes, 'volume', GRID_W, GRID_D);
    expect(plan.usedHeightCm).toBeCloseTo(15.2, 6);
    expect(plan.wastedHeightCm).toBeCloseTo(7.6, 6);
  });

  it('settles floating boxes before totalling', () => {
    const plan = planFrom(space, [box('M', 0, 0, 2, 1, 15.2)], 'volume', GRID_W, GRID_D);
    expect(plan.placements[0]!.zCm).toBe(0);
    expect(plan.usedHeightCm).toBeCloseTo(7.6, 6);
  });

  it('handles an empty space', () => {
    const plan = planFrom(space, [], 'volume', GRID_W, GRID_D);
    expect(plan.boxCount).toBe(0);
    expect(plan.usedHeightCm).toBe(0);
    expect(plan.wastedHeightCm).toBeCloseTo(H, 6);
  });
});

describe("a hand-built mixed stack", () => {
  // 3x M stacked, beside a 3M, beside an M carrying two 2S — every column 22.8 cm.
  it('is accepted and lands at the expected heights', () => {
    const boxes: Placement[] = [];
    const push = (p: Placement) => {
      expect(canPlace(p, boxes, GRID_W, GRID_D, H)).toBe(true);
      boxes.push({ ...p, zCm: restHeight(p, boxes) });
    };

    push(box('M', 0, 0, 2, 1));
    push(box('M', 0, 0, 2, 1));
    push(box('M', 0, 0, 2, 1));
    push(box('3M', 0, 1, 2, 1));
    push(box('M', 2, 0, 2, 1));
    push(box('2S', 2, 0, 1, 1));
    push(box('2S', 3, 0, 1, 1));

    expect(boxes.map((p) => p.zCm)).toEqual([0, 7.6, 15.2, 0, 0, 7.6, 7.6]);
    const plan = planFrom(space, boxes, 'volume', GRID_W, GRID_D);
    expect(plan.usedHeightCm).toBeCloseTo(22.8, 6);
    expect(plan.boxCount).toBe(7);
  });
});
