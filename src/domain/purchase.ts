import { BOXES, BOX_BY_ID, SETS } from '../data/catalog';

export interface BasketLine {
  kind: 'set' | 'single';
  id: string;
  label: string;
  qty: number;
  unitEur: number;
  subtotalEur: number;
  url: string;
}

export interface Basket {
  lines: BasketLine[];
  totalEur: number;
  /** What the same plan costs buying every box on its own. */
  singlesEur: number;
  savingEur: number;
  /** Boxes the chosen sets deliver beyond what the plan asked for. */
  surplus: Record<string, number>;
  surplusEur: number;
}

/**
 * Cheapest way to actually buy a plan.
 *
 * Sets are only ever sold with fixed contents, so covering a plan is a small
 * integer covering problem: pick how many of each set to buy, then fill whatever
 * is still missing with singles. Overshooting is allowed — a set can be worth
 * buying even when it brings boxes the plan never asked for.
 */
export function cheapestBasket(counts: Record<string, number>): Basket {
  const ids = BOXES.filter((b) => (counts[b.id] ?? 0) > 0).map((b) => b.id);
  const need = ids.map((id) => counts[id]!);
  const unit = ids.map((id) => BOX_BY_ID.get(id)!.priceEur);
  const singlesEur = need.reduce((sum, n, i) => sum + n * unit[i]!, 0);

  const sets = SETS.filter((s) => s.available);
  const supply = sets.map((s) => ids.map((id) => s.contents[id] ?? 0));
  const singlesCost = (left: number[]) => left.reduce((sum, n, i) => sum + n * unit[i]!, 0);

  // No set replaces singles for less than this fraction of their price, so no
  // completion of a partial basket can beat `cost + minRatio * whatIsLeft`.
  const minRatio = Math.min(1, ...sets.map((s) => s.priceEur / s.singlesEur));

  let bestCost = singlesEur;
  let bestQty = sets.map(() => 0);
  const qty = sets.map(() => 0);

  function search(i: number, left: number[], cost: number): void {
    if (cost + minRatio * singlesCost(left) >= bestCost - 1e-9) return;
    if (i === sets.length) {
      const total = cost + singlesCost(left);
      if (total < bestCost - 1e-9) {
        bestCost = total;
        bestQty = [...qty];
      }
      return;
    }
    // Past this many copies every box in the set is surplus, so more only costs more.
    let max = 0;
    for (let k = 0; k < ids.length; k++) {
      const per = supply[i]![k]!;
      if (per > 0) max = Math.max(max, Math.ceil(left[k]! / per));
    }
    for (let k = 0; k <= max; k++) {
      qty[i] = k;
      search(
        i + 1,
        left.map((n, j) => Math.max(0, n - k * supply[i]![j]!)),
        cost + k * sets[i]!.priceEur,
      );
    }
    qty[i] = 0;
  }

  search(0, need, 0);

  const lines: BasketLine[] = [];
  const supplied: Record<string, number> = {};
  sets.forEach((set, i) => {
    const k = bestQty[i]!;
    if (k === 0) return;
    lines.push({
      kind: 'set',
      id: set.productId,
      label: set.label,
      qty: k,
      unitEur: set.priceEur,
      subtotalEur: k * set.priceEur,
      url: set.url,
    });
    for (const [id, n] of Object.entries(set.contents)) {
      supplied[id] = (supplied[id] ?? 0) + k * n;
    }
  });

  for (const id of ids) {
    const short = counts[id]! - (supplied[id] ?? 0);
    if (short <= 0) continue;
    const box = BOX_BY_ID.get(id)!;
    lines.push({
      kind: 'single',
      id,
      label: `Box ${id}`,
      qty: short,
      unitEur: box.priceEur,
      subtotalEur: short * box.priceEur,
      url: box.url,
    });
  }

  const surplus: Record<string, number> = {};
  let surplusEur = 0;
  for (const [id, n] of Object.entries(supplied)) {
    const over = n - (counts[id] ?? 0);
    if (over <= 0) continue;
    surplus[id] = over;
    surplusEur += over * (BOX_BY_ID.get(id)?.priceEur ?? 0);
  }

  return {
    lines,
    totalEur: bestCost,
    singlesEur,
    savingEur: singlesEur - bestCost,
    surplus,
    surplusEur,
  };
}
