import { BOX_BY_ID, boxesUpToHeight } from '../data/catalog';
import type { Footprint, Objective, Plan, Placement, Space } from './types';
import { usableDims } from './types';

const EPS = 1e-6;

export function heightOf(p: { skuId: string }): number {
  return BOX_BY_ID.get(p.skuId)?.heightCm ?? 0;
}

/** Height of the top face of a box. */
export function topOf(p: Placement): number {
  return p.zCm + heightOf(p);
}

function overlapsXY(a: Footprint, b: Footprint): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

/**
 * Per-cell surface height under a footprint: how high a box dropped onto each cell
 * would come to rest. Cells covered by nothing read 0, the space's own floor.
 */
function surfaceUnder(foot: Footprint, others: Placement[]): number[] {
  const heights: number[] = [];
  for (let y = foot.y; y < foot.y + foot.d; y++) {
    for (let x = foot.x; x < foot.x + foot.w; x++) {
      let top = 0;
      for (const o of others) {
        if (x < o.x || x >= o.x + o.w || y < o.y || y >= o.y + o.d) continue;
        top = Math.max(top, topOf(o));
      }
      heights.push(top);
    }
  }
  return heights;
}

/** The height a box would come to rest at if dropped onto this footprint. */
export function restHeight(foot: Footprint, others: Placement[]): number {
  return surfaceUnder(foot, others).reduce((max, h) => Math.max(max, h), 0);
}

/**
 * A box is supported only if its whole base is in contact — every cell beneath it
 * must reach the same height. Anything else would overhang and tip.
 */
export function isSupported(p: Placement, others: Placement[]): boolean {
  // Only what is genuinely underneath can hold a box up; boxes stacked on top of
  // it reach higher but carry no load.
  const below = others.filter((o) => topOf(o) <= p.zCm + EPS);
  return surfaceUnder(p, below).every((h) => Math.abs(h - p.zCm) < EPS);
}

export function otherThan(placements: Placement[], skip: number): Placement[] {
  return placements.filter((_, i) => i !== skip);
}

/**
 * Whether a box may be dropped onto this footprint: inside the grid, under the
 * ceiling, and landing flat on the floor or on box tops that are all level.
 */
export function canPlace(
  foot: Footprint,
  others: Placement[],
  gridW: number,
  gridD: number,
  usableHeightCm: number,
): boolean {
  if (foot.x < 0 || foot.y < 0) return false;
  if (foot.x + foot.w > gridW || foot.y + foot.d > gridD) return false;
  const surface = surfaceUnder(foot, others);
  const rest = surface.reduce((max, h) => Math.max(max, h), 0);
  if (!surface.every((h) => Math.abs(h - rest) < EPS)) return false;
  return rest + heightOf(foot) <= usableHeightCm + EPS;
}

/**
 * Drops every box as far as it will go, lowest first, so removing or shrinking a
 * box makes whatever rested on it fall rather than float.
 */
export function settle(placements: Placement[]): Placement[] {
  const ordered = [...placements].sort((a, b) => a.zCm - b.zCm);
  const settled: Placement[] = [];
  for (const p of ordered) {
    settled.push({ ...p, zCm: restHeight(p, settled) });
  }
  return settled;
}

/** Distinct base heights present in the plan, bottom to top. */
export function levelsOf(placements: Placement[]): number[] {
  const levels = [...new Set(placements.map((p) => Math.round(p.zCm * 100) / 100))];
  return levels.sort((a, b) => a - b);
}

function orientationsOf(sku: { w: number; d: number }) {
  return sku.w === sku.d
    ? [{ w: sku.w, d: sku.d, rotated: false }]
    : [
        { w: sku.w, d: sku.d, rotated: false },
        { w: sku.d, d: sku.w, rotated: true },
      ];
}

/** Fills every gap with the largest box that fits, repeating so boxes stack. */
export function fillEmpty(
  placements: Placement[],
  gridW: number,
  gridD: number,
  usableHeightCm: number,
): Placement[] {
  const skus = boxesUpToHeight(usableHeightCm).sort(
    (a, b) => b.w * b.d - a.w * a.d || b.heightCm - a.heightCm,
  );
  const result = [...placements];

  let added = true;
  while (added) {
    added = false;
    for (let y = 0; y < gridD; y++) {
      for (let x = 0; x < gridW; x++) {
        for (const sku of skus) {
          const option = orientationsOf(sku).find((o) =>
            canPlace({ skuId: sku.id, x, y, ...o }, result, gridW, gridD, usableHeightCm),
          );
          if (!option) continue;
          const foot: Footprint = { skuId: sku.id, x, y, ...option };
          result.push({ ...foot, zCm: restHeight(foot, result) });
          added = true;
          break;
        }
      }
    }
  }
  return result;
}

/** The first spot a box will drop into, scanning back to front, left to right. */
export function firstFreeSpot(
  skuId: string,
  placements: Placement[],
  gridW: number,
  gridD: number,
  usableHeightCm: number,
): Placement | null {
  const sku = BOX_BY_ID.get(skuId);
  if (!sku) return null;
  for (let y = 0; y < gridD; y++) {
    for (let x = 0; x < gridW; x++) {
      for (const o of orientationsOf(sku)) {
        const foot: Footprint = { skuId, x, y, ...o };
        if (canPlace(foot, placements, gridW, gridD, usableHeightCm)) {
          return { ...foot, zCm: restHeight(foot, placements) };
        }
      }
    }
  }
  return null;
}

/**
 * Boxes that could replace a placement in situ. A candidate has to land at the same
 * height and leave room for whatever is stacked on top of the box it replaces.
 */
export function swapCandidates(
  placements: Placement[],
  index: number,
  gridW: number,
  gridD: number,
  usableHeightCm: number,
) {
  const current = placements[index];
  if (!current) return [];
  const others = otherThan(placements, index);
  // Boxes stacked on this one ride along, so they support nothing and are ignored
  // when working out where a replacement would land.
  const carried = others.filter((o) => overlapsXY(o, current) && o.zCm > current.zCm + EPS);
  const around = others.filter((o) => !carried.includes(o));
  const stackAbove = carried.reduce((max, o) => Math.max(max, topOf(o) - topOf(current)), 0);

  return boxesUpToHeight(usableHeightCm).flatMap((sku) =>
    orientationsOf(sku)
      .filter((o) => {
        const foot: Footprint = { skuId: sku.id, x: current.x, y: current.y, ...o };
        if (!canPlace(foot, around, gridW, gridD, usableHeightCm)) return false;
        if (Math.abs(restHeight(foot, around) - current.zCm) > EPS) return false;
        return current.zCm + sku.heightCm + stackAbove <= usableHeightCm + EPS;
      })
      .map((o) => ({ sku, ...o })),
  );
}

export function planStats(placements: Placement[]): {
  capacityL: number;
  priceEur: number;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  let capacityL = 0;
  let priceEur = 0;
  for (const p of placements) {
    const sku = BOX_BY_ID.get(p.skuId);
    if (!sku) continue;
    capacityL += sku.capacityL;
    priceEur += sku.priceEur;
    counts[p.skuId] = (counts[p.skuId] ?? 0) + 1;
  }
  return { capacityL, priceEur, counts };
}

/** Rebuilds plan totals from a hand-edited box list. */
export function planFrom(
  space: Space,
  placements: Placement[],
  objective: Objective,
  gridW: number,
  gridD: number,
): Plan {
  const usable = usableDims(space);
  const settled = settle(placements);
  const { capacityL, priceEur, counts } = planStats(settled);
  const usedHeightCm = settled.reduce((max, p) => Math.max(max, topOf(p)), 0);

  return {
    spaceId: space.id,
    objective,
    placements: settled,
    gridW,
    gridD,
    capacityL,
    priceEur,
    boxCount: settled.length,
    counts,
    usedHeightCm,
    wastedHeightCm: usable.heightCm - usedHeightCm,
  };
}
