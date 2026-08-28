import { describe, expect, it } from 'vitest';
import { CELL, KX, KY, isoBounds, isoGridDelta, isoProject } from './iso';

describe('isoProject', () => {
  it('puts the grid origin at the projection origin', () => {
    expect(isoProject(0, 0, 0)).toEqual([0, 0]);
  });

  it('sends +x to the lower right and +y to the lower left', () => {
    const [px, py] = isoProject(1, 0, 0);
    expect(px).toBeGreaterThan(0);
    expect(py).toBeGreaterThan(0);

    const [qx, qy] = isoProject(0, 1, 0);
    expect(qx).toBeLessThan(0);
    expect(qy).toBeGreaterThan(0);
  });

  it('sends height straight up the screen', () => {
    const [x0, y0] = isoProject(2, 3, 0);
    const [x1, y1] = isoProject(2, 3, 10);
    expect(x1).toBeCloseTo(x0, 9);
    expect(y1).toBeLessThan(y0);
  });
});

describe('isoGridDelta', () => {
  it('inverts a ground-plane move exactly', () => {
    const moves: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [3, -2],
      [-4, 5],
      [0, 0],
    ];
    for (const [dx, dy] of moves) {
      const screenDx = (dx - dy) * KX * CELL;
      const screenDy = (dx + dy) * KY * CELL;
      expect(isoGridDelta(screenDx, screenDy)).toEqual([dx, dy]);
    }
  });

  it('snaps a drag that lands between cells', () => {
    const screenDx = (1 - 0) * KX * CELL + 3;
    const screenDy = (1 + 0) * KY * CELL - 2;
    expect(isoGridDelta(screenDx, screenDy)).toEqual([1, 0]);
  });

  it('compensates for a downscaled SVG', () => {
    const screenDx = (2 - 1) * KX * CELL;
    const screenDy = (2 + 1) * KY * CELL;
    expect(isoGridDelta(screenDx * 0.5, screenDy * 0.5, 0.5)).toEqual([2, 1]);
  });
});

describe('isoBounds', () => {
  it('fits the whole grid inside the viewBox', () => {
    const gridW = 5;
    const gridD = 4;
    const maxCm = 40;
    const padLeft = 54;
    const pad = 18;
    const { offX, offY, width, height } = isoBounds(gridW, gridD, maxCm, padLeft, pad);

    const corners: [number, number, number][] = [
      [0, 0, 0],
      [gridW, 0, 0],
      [0, gridD, 0],
      [gridW, gridD, 0],
      [0, 0, maxCm],
      [gridW, 0, maxCm],
      [0, gridD, maxCm],
      [gridW, gridD, maxCm],
    ];
    for (const [gx, gy, z] of corners) {
      const [px, py] = isoProject(gx, gy, z);
      expect(offX + px).toBeGreaterThanOrEqual(0);
      expect(offX + px).toBeLessThanOrEqual(width);
      expect(offY + py).toBeGreaterThanOrEqual(0);
      expect(offY + py).toBeLessThanOrEqual(height);
    }
  });

  it('reserves the left padding for the height ticks', () => {
    const { offX } = isoBounds(5, 4, 40, 54, 18);
    const [px] = isoProject(0, 4, 0);
    expect(offX + px).toBeCloseTo(54, 9);
  });
});
