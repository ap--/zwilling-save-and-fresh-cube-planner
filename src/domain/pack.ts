import type { BoxSku } from '../data/catalog';
import type { Footprint, Objective } from './types';

export interface PackResult {
  placements: Footprint[];
  capacityL: number;
  priceEur: number;
  count: number;
}

interface Score {
  cap: number;
  price: number;
  count: number;
}

interface Option {
  sku: BoxSku;
  w: number;
  d: number;
  rotated: boolean;
}

/** Lexicographic ranking of additive scores; negative means `a` is better. */
function compare(a: Score, b: Score, objective: Objective): number {
  const order: (keyof Score)[] =
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

function placementOptions(skus: BoxSku[]): Option[] {
  const options: Option[] = [];
  for (const sku of skus) {
    options.push({ sku, w: sku.w, d: sku.d, rotated: false });
    if (sku.w !== sku.d) options.push({ sku, w: sku.d, d: sku.w, rotated: true });
  }
  return options;
}

/**
 * Tiles a gridW × gridD footprint completely, optimally for the given objective.
 *
 * Uses a broken-profile bitmask DP: cells are visited row-major while carrying a
 * mask of cells already covered in the current row and the row below. Since every
 * height step offers a 1×1 box, full coverage is normally achievable; `null` is
 * returned when the available footprints cannot tile the grid exactly.
 *
 * Keep `gridW` the smaller dimension — it sets the bitmask width.
 */
export function packLayer(
  gridW: number,
  gridD: number,
  skus: BoxSku[],
  objective: Objective,
): PackResult | null {
  if (gridW <= 0 || gridD <= 0) {
    return { placements: [], capacityL: 0, priceEur: 0, count: 0 };
  }
  if (gridW > 24) throw new Error(`packLayer: gridW ${gridW} too large for bitmask DP`);

  const options = placementOptions(skus).filter((o) => o.w <= gridW && o.d <= gridD);
  if (options.length === 0) return null;

  const full = (1 << gridW) - 1;
  type Move = { option: Option } | 'skip' | 'advance' | null;
  interface Memo {
    score: Score | null;
    move: Move;
  }
  const memo = new Map<number, Memo>();
  const key = (r: number, c: number, cur: number, next: number) =>
    ((r * (gridW + 1) + c) << (2 * gridW)) | (cur << gridW) | next;

  function solve(r: number, c: number, cur: number, next: number): Memo {
    if (r === gridD) return { score: { cap: 0, price: 0, count: 0 }, move: null };

    const k = key(r, c, cur, next);
    const cached = memo.get(k);
    if (cached) return cached;

    // Guard against pathological recursion depth before writing the real result.
    memo.set(k, { score: null, move: null });

    let best: Memo = { score: null, move: null };

    if (c === gridW) {
      const sub = solve(r + 1, 0, next, 0);
      best = { score: sub.score, move: 'advance' };
    } else if (cur & (1 << c)) {
      const sub = solve(r, c + 1, cur, next);
      best = { score: sub.score, move: 'skip' };
    } else {
      for (const option of options) {
        if (c + option.w > gridW || r + option.d > gridD) continue;
        const span = ((1 << option.w) - 1) << c;
        if (cur & span) continue;
        if (option.d === 2 && next & span) continue;

        const sub = solve(r, c + option.w, cur | span, option.d === 2 ? next | span : next);
        if (!sub.score) continue;

        const score: Score = {
          cap: sub.score.cap + option.sku.capacityL,
          price: sub.score.price + option.sku.priceEur,
          count: sub.score.count + 1,
        };
        if (!best.score || compare(score, best.score, objective) < 0) {
          best = { score, move: { option } };
        }
      }
    }

    memo.set(k, best);
    return best;
  }

  const root = solve(0, 0, 0, 0);
  if (!root.score) return null;

  // Replay the recorded moves to materialise placements.
  const placements: Footprint[] = [];
  let r = 0;
  let c = 0;
  let cur = 0;
  let next = 0;
  while (r < gridD) {
    const entry = memo.get(key(r, c, cur, next));
    if (!entry || entry.move === null) break;
    if (entry.move === 'advance') {
      r += 1;
      c = 0;
      cur = next;
      next = 0;
    } else if (entry.move === 'skip') {
      c += 1;
    } else {
      const { option } = entry.move;
      placements.push({
        skuId: option.sku.id,
        x: c,
        y: r,
        w: option.w,
        d: option.d,
        rotated: option.rotated,
      });
      const span = ((1 << option.w) - 1) << c;
      cur |= span;
      if (option.d === 2) next |= span;
      c += option.w;
    }
  }

  if (cur !== full && gridD > 0 && placements.length === 0) return null;

  return {
    placements,
    capacityL: root.score.cap,
    priceEur: root.score.price,
    count: root.score.count,
  };
}
