import { describe, expect, it } from 'vitest';
import {
  BOXES,
  BOX_BY_ID,
  HEIGHT_STEPS_CM,
  SETS,
  UNIT_CM,
  boxesOfHeight,
} from '../data/catalog';

describe('catalog', () => {
  it('parses every box SKU', () => {
    expect(BOXES.map((b) => b.id).sort()).toEqual(
      ['2L', '2M', '2S', '3M', '3S', '4S', 'L', 'M', 'S'].sort(),
    );
  });

  it('places every footprint on the UNIT_CM grid', () => {
    for (const b of BOXES) {
      expect(Math.abs(b.widthCm / UNIT_CM - b.w)).toBeLessThan(0.05);
      expect(Math.abs(b.depthCm / UNIT_CM - b.d)).toBeLessThan(0.05);
    }
  });

  it('maps footprint letters to the expected cell sizes', () => {
    expect([BOX_BY_ID.get('S')!.w, BOX_BY_ID.get('S')!.d]).toEqual([1, 1]);
    expect([BOX_BY_ID.get('M')!.w, BOX_BY_ID.get('M')!.d]).toEqual([2, 1]);
    expect([BOX_BY_ID.get('L')!.w, BOX_BY_ID.get('L')!.d]).toEqual([2, 2]);
  });

  it('exposes four height steps, each with a 1x1 box so any grid can be filled', () => {
    expect(HEIGHT_STEPS_CM).toEqual([7.6, 15.2, 22.8, 29.5]);
    for (const h of HEIGHT_STEPS_CM) {
      expect(boxesOfHeight(h).some((b) => b.w === 1 && b.d === 1)).toBe(true);
    }
  });

  it('has a positive price and capacity for every box', () => {
    for (const b of BOXES) {
      expect(b.priceEur).toBeGreaterThan(0);
      expect(b.capacityL).toBeGreaterThan(0);
    }
  });
});

describe('sets', () => {
  const setBy = (label: string) => SETS.find((s) => s.label === label)!;

  it('drops the XS set and keeps the four with hand-entered contents', () => {
    expect(SETS.map((s) => s.label)).toEqual(['Set S', 'Set M', 'Set S & M', 'Set S/M']);
    expect(SETS.some((s) => /XS/.test(s.name))).toBe(false);
  });

  it('lists only boxes that exist, and no more than the advertised piece count', () => {
    for (const set of SETS) {
      expect(set.boxCount).toBeGreaterThan(0);
      expect(set.boxCount).toBeLessThanOrEqual(set.pieces || set.boxCount);
      for (const id of Object.keys(set.contents)) {
        expect(BOX_BY_ID.has(id), `${set.label} lists ${id}`).toBe(true);
      }
    }
  });

  it('has the contents that were entered by hand', () => {
    expect(setBy('Set S').contents).toEqual({ S: 1, '2S': 2, '3S': 1 });
    expect(setBy('Set M').contents).toEqual({ M: 1, '2M': 1, '3M': 1 });
    expect(setBy('Set S & M').contents).toEqual({
      S: 1,
      '2S': 2,
      '3S': 1,
      M: 1,
      '2M': 1,
      '3M': 1,
    });
    expect(setBy('Set S/M').contents).toEqual({
      S: 1,
      '2S': 2,
      '3S': 1,
      '4S': 1,
      M: 2,
      '2M': 2,
    });
  });

  it('derives capacity and singles price from the contents', () => {
    for (const set of SETS) {
      const expected = Object.entries(set.contents).reduce(
        (acc, [id, qty]) => {
          const box = BOX_BY_ID.get(id)!;
          return { cap: acc.cap + qty * box.capacityL, eur: acc.eur + qty * box.priceEur };
        },
        { cap: 0, eur: 0 },
      );
      expect(set.capacityL).toBeCloseTo(expected.cap, 6);
      expect(set.singlesEur).toBeCloseTo(expected.eur, 6);
    }
  });
});
