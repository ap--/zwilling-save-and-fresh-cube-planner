import { describe, expect, it } from 'vitest';
import { BOX_BY_ID, SETS } from '../data/catalog';
import { cheapestBasket } from './purchase';

const setBy = (label: string) => SETS.find((s) => s.label === label)!;
const price = (id: string) => BOX_BY_ID.get(id)!.priceEur;

/** Every box the basket delivers, sets expanded. */
function delivered(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of cheapestBasket(counts).lines) {
    if (line.kind === 'single') {
      out[line.id] = (out[line.id] ?? 0) + line.qty;
      continue;
    }
    const set = SETS.find((s) => s.productId === line.id)!;
    for (const [id, n] of Object.entries(set.contents)) {
      out[id] = (out[id] ?? 0) + n * line.qty;
    }
  }
  return out;
}

describe('cheapestBasket', () => {
  it('buys nothing for an empty plan', () => {
    const basket = cheapestBasket({});
    expect(basket.lines).toEqual([]);
    expect(basket.totalEur).toBe(0);
    expect(basket.savingEur).toBe(0);
  });

  it('buys singles when no set helps', () => {
    const basket = cheapestBasket({ L: 2, '2L': 1 });
    expect(basket.lines.every((l) => l.kind === 'single')).toBe(true);
    expect(basket.totalEur).toBeCloseTo(2 * price('L') + price('2L'), 6);
    expect(basket.savingEur).toBeCloseTo(0, 6);
  });

  it('takes a set when it exactly matches the need', () => {
    const set = setBy('Set S');
    const basket = cheapestBasket(set.contents);
    expect(basket.lines).toHaveLength(1);
    expect(basket.lines[0]!.label).toBe('Set S');
    expect(basket.totalEur).toBeCloseTo(set.priceEur, 6);
    expect(basket.savingEur).toBeCloseTo(set.singlesEur - set.priceEur, 6);
    expect(basket.surplusEur).toBe(0);
  });

  it('overshoots when a set is cheaper than the singles it replaces', () => {
    // An S plus two 2S is 46,85 EUR; Set S is 44,95 EUR and throws in a 3S.
    const need = { S: 1, '2S': 2 };
    const basket = cheapestBasket(need);
    expect(basket.totalEur).toBeLessThan(price('S') + 2 * price('2S'));
    expect(basket.surplus).toEqual({ '3S': 1 });
    expect(delivered(need)['2S']).toBeGreaterThanOrEqual(2);
  });

  it('never delivers fewer boxes than the plan needs', () => {
    const plans: Record<string, number>[] = [
      { S: 5, '2S': 3, '3M': 2 },
      { '4S': 4, M: 7, '2M': 1, L: 2 },
      { S: 1 },
      { '3S': 9, '2M': 4, '2L': 3 },
    ];
    for (const plan of plans) {
      const got = delivered(plan);
      for (const [id, n] of Object.entries(plan)) {
        expect(got[id] ?? 0, `${id} in ${JSON.stringify(plan)}`).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it('never costs more than buying everything separately', () => {
    const plans: Record<string, number>[] = [
      { S: 5, '2S': 3, '3M': 2 },
      { '4S': 4, M: 7, '2M': 1, L: 2 },
      { '3S': 9, '2M': 4, '2L': 3 },
      { M: 1, '2M': 1, '3M': 1 },
    ];
    for (const plan of plans) {
      const basket = cheapestBasket(plan);
      expect(basket.totalEur).toBeLessThanOrEqual(basket.singlesEur + 1e-9);
      expect(basket.savingEur).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('adds up: line subtotals equal the total', () => {
    const basket = cheapestBasket({ S: 3, '2S': 5, '3S': 2, M: 2, '2M': 1, '3M': 3 });
    const sum = basket.lines.reduce((n, l) => n + l.subtotalEur, 0);
    expect(sum).toBeCloseTo(basket.totalEur, 6);
    for (const line of basket.lines) {
      expect(line.subtotalEur).toBeCloseTo(line.qty * line.unitEur, 6);
    }
  });

  it('matches a brute-force search over set quantities', () => {
    const plans: Record<string, number>[] = [
      { S: 2, '2S': 4, '3S': 1, M: 3 },
      { '4S': 3, '2M': 2, '3M': 1 },
      { S: 6, M: 6 },
    ];
    for (const plan of plans) {
      const ids = [...new Set([...Object.keys(plan), ...SETS.flatMap((s) => Object.keys(s.contents))])];
      const sets = SETS.filter((s) => s.available);
      let best = Infinity;
      const walk = (i: number, left: Record<string, number>, cost: number) => {
        if (i === sets.length) {
          const rest = ids.reduce((n, id) => n + (left[id] ?? 0) * price(id), 0);
          best = Math.min(best, cost + rest);
          return;
        }
        const set = sets[i]!;
        let max = 0;
        for (const [id, per] of Object.entries(set.contents)) {
          max = Math.max(max, Math.ceil((left[id] ?? 0) / per));
        }
        for (let k = 0; k <= max; k++) {
          const next: Record<string, number> = {};
          for (const id of ids) {
            next[id] = Math.max(0, (left[id] ?? 0) - k * (set.contents[id] ?? 0));
          }
          walk(i + 1, next, cost + k * set.priceEur);
        }
      };
      walk(0, { ...plan }, 0);
      expect(cheapestBasket(plan).totalEur, JSON.stringify(plan)).toBeCloseTo(best, 6);
    }
  });
});
