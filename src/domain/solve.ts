import { HEIGHT_STEPS_CM, SETS, UNIT_CM, boxesOfHeight } from '../data/catalog';
import { packLayer, type PackResult } from './pack';
import { cheapestBasket } from './purchase';
import type { Objective, Placement, Plan, Space } from './types';
import { usableDims } from './types';

/** Heights are handled in millimetres so the layer knapsack stays integral. */
const MM = 10;

interface StackScore {
  usedMm: number;
  cap: number;
  price: number;
  count: number;
}

/**
 * Ranks layer stacks. Filling the space is always the primary goal — otherwise a
 * "cheapest" or "fewest boxes" objective degenerates to buying nothing.
 */
function compareStacks(a: StackScore, b: StackScore, objective: Objective): number {
  if (a.usedMm !== b.usedMm) return b.usedMm - a.usedMm;
  const order: (keyof StackScore)[] =
    objective === 'volume'
      ? ['cap', 'price', 'count']
      : objective === 'price'
        ? ['price', 'cap', 'count']
        : ['count', 'cap', 'price'];
  for (const key of order) {
    const diff = key === 'cap' ? b.cap - a.cap : a[key] - b[key];
    if (Math.abs(diff) > 1e-9) return diff;
  }
  return 0;
}

export interface SolveOptions {
  includeUnavailable?: boolean;
  /** Restrict to these SKU ids; omit to allow the whole catalog. */
  allowedSkuIds?: string[];
}

export function solveSpace(
  space: Space,
  objective: Objective,
  options: SolveOptions = {},
): Plan {
  const usable = usableDims(space);
  const cellsW = Math.floor(usable.widthCm / UNIT_CM);
  const cellsD = Math.floor(usable.depthCm / UNIT_CM);

  const empty: Plan = {
    spaceId: space.id,
    objective,
    placements: [],
    gridW: Math.max(0, cellsW),
    gridD: Math.max(0, cellsD),
    capacityL: 0,
    priceEur: 0,
    boxCount: 0,
    counts: {},
    usedHeightCm: 0,
    wastedHeightCm: usable.heightCm,
  };
  if (cellsW < 1 || cellsD < 1) return empty;

  // The bitmask width must be the smaller dimension to bound the state space.
  const transposed = cellsW > cellsD;
  const gw = transposed ? cellsD : cellsW;
  const gd = transposed ? cellsW : cellsD;

  const packed = new Map<number, PackResult>();
  for (const h of HEIGHT_STEPS_CM) {
    if (h > usable.heightCm) continue;
    let skus = boxesOfHeight(h, options.includeUnavailable ?? false);
    if (options.allowedSkuIds) {
      const allow = new Set(options.allowedSkuIds);
      skus = skus.filter((s) => allow.has(s.id));
    }
    const result = packLayer(gw, gd, skus, objective);
    if (result && result.placements.length > 0) packed.set(Math.round(h * MM), result);
  }
  if (packed.size === 0) return empty;

  // Unbounded knapsack over layer heights.
  const capMm = Math.floor(usable.heightCm * MM);
  const best: (StackScore | null)[] = new Array(capMm + 1).fill(null);
  const choice: number[] = new Array(capMm + 1).fill(0);
  best[0] = { usedMm: 0, cap: 0, price: 0, count: 0 };

  for (let i = 1; i <= capMm; i++) {
    best[i] = best[i - 1] ?? null;
    choice[i] = -1; // carry the previous best forward
    for (const [hMm, layer] of packed) {
      const prev = i >= hMm ? best[i - hMm] : null;
      if (!prev) continue;
      const candidate: StackScore = {
        usedMm: prev.usedMm + hMm,
        cap: prev.cap + layer.capacityL,
        price: prev.price + layer.priceEur,
        count: prev.count + layer.count,
      };
      const incumbent = best[i];
      if (!incumbent || compareStacks(candidate, incumbent, objective) < 0) {
        best[i] = candidate;
        choice[i] = hMm;
      }
    }
  }

  const finalScore = best[capMm];
  if (!finalScore || finalScore.usedMm === 0) return empty;

  const heights: number[] = [];
  for (let i = capMm; i > 0; ) {
    const c = choice[i]!;
    if (c === -1) {
      i -= 1;
      continue;
    }
    heights.push(c);
    i -= c;
  }
  heights.sort((a, b) => b - a); // tallest at the bottom

  const counts: Record<string, number> = {};
  const placements: Placement[] = [];
  let baseCm = 0;
  for (const hMm of heights) {
    const result = packed.get(hMm)!;
    for (const p of result.placements) {
      const oriented = transposed ? { ...p, x: p.y, y: p.x, w: p.d, d: p.w } : { ...p };
      placements.push({ ...oriented, zCm: baseCm });
      counts[p.skuId] = (counts[p.skuId] ?? 0) + 1;
    }
    baseCm += hMm / MM;
  }

  return {
    spaceId: space.id,
    objective,
    placements,
    gridW: cellsW,
    gridD: cellsD,
    capacityL: finalScore.cap,
    priceEur: finalScore.price,
    boxCount: finalScore.count,
    counts,
    usedHeightCm: finalScore.usedMm / MM,
    wastedHeightCm: usable.heightCm - finalScore.usedMm / MM,
  };
}

export const OBJECTIVES: Objective[] = ['volume', 'price', 'count'];

/**
 * SKU restrictions worth packing under, once sets are what you actually pay.
 * Packing from a single set's contents gives that set a chance to be used whole,
 * which the unrestricted optimum would never stumble into on its own.
 */
function priceRestrictions(): (string[] | null)[] {
  return [
    null,
    ...SETS.map((s) => Object.keys(s.contents)),
    [...new Set(SETS.flatMap((s) => Object.keys(s.contents)))],
  ];
}

/**
 * Cheapest plan by what the till actually charges: candidate packings scored with
 * the set-aware basket rather than the sum of single-box prices.
 *
 * Sets are only considered against this one space. They amortise across spaces
 * too, which the shopping-list basket does handle — but no set is cheaper per
 * unit of space than a 2L or 3M single, so no set can win a race to fill a space
 * anyway. `set-pricing.test.ts` pins that down.
 */
export function solveCheapest(space: Space, options: SolveOptions = {}): Plan {
  const allow = options.allowedSkuIds ? new Set(options.allowedSkuIds) : null;

  let best: Plan | null = null;
  let bestCost = Infinity;

  for (const ids of priceRestrictions()) {
    const restricted = ids && allow ? ids.filter((id) => allow.has(id)) : (ids ?? options.allowedSkuIds ?? null);
    const opts: SolveOptions = restricted ? { ...options, allowedSkuIds: restricted } : options;

    // Both, because the ratio a set sells in is closer to a volume-optimal packing.
    for (const objective of ['price', 'volume'] as const) {
      const plan = solveSpace(space, objective, opts);
      if (plan.placements.length === 0) continue;
      const cost = cheapestBasket(plan.counts).totalEur;

      if (
        !best ||
        plan.usedHeightCm > best.usedHeightCm + 1e-9 ||
        (plan.usedHeightCm > best.usedHeightCm - 1e-9 &&
          (cost < bestCost - 1e-9 ||
            (cost < bestCost + 1e-9 && plan.capacityL > best.capacityL + 1e-9)))
      ) {
        best = plan;
        bestCost = cost;
      }
    }
  }

  return best ? { ...best, objective: 'price' } : solveSpace(space, 'price', options);
}

/** Solves a space the way the chosen objective means it. */
export function planForObjective(
  space: Space,
  objective: Objective,
  options: SolveOptions = {},
): Plan {
  return objective === 'price'
    ? solveCheapest(space, options)
    : solveSpace(space, objective, options);
}

/** Solves once per objective so the UI can show the trade-offs side by side. */
export function solveAllObjectives(
  space: Space,
  options: SolveOptions = {},
): Record<Objective, Plan> {
  return {
    volume: solveSpace(space, 'volume', options),
    price: solveCheapest(space, options),
    count: solveSpace(space, 'count', options),
  };
}
