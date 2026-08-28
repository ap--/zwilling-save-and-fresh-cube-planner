/** Isometric projection shared by the 3D view and its tests. */

export const CELL = 30; // px per footprint cell
export const Z = 3.4; // px per cm of height
export const KX = Math.cos(Math.PI / 6);
export const KY = Math.sin(Math.PI / 6);

/** Grid cell corner + height in cm to a point on the isometric plane, before padding. */
export function isoProject(gx: number, gy: number, zCm: number): [number, number] {
  return [(gx - gy) * KX * CELL, (gx + gy) * KY * CELL - zCm * Z];
}

/**
 * Inverse of `isoProject` restricted to the ground plane: turns a screen-space drag
 * into whole grid cells. `scale` undoes any CSS downscaling of the SVG.
 */
export function isoGridDelta(screenDx: number, screenDy: number, scale = 1): [number, number] {
  const a = screenDx / scale / (KX * CELL);
  const b = screenDy / scale / (KY * CELL);
  // `+ 0` normalises Math.round's -0 for small negative drags.
  return [Math.round((a + b) / 2) + 0, Math.round((b - a) / 2) + 0];
}

export function isoBounds(
  gridW: number,
  gridD: number,
  maxCm: number,
  padLeft: number,
  pad: number,
) {
  return {
    offX: padLeft + gridD * KX * CELL,
    offY: pad + maxCm * Z,
    width: padLeft + (gridW + gridD) * KX * CELL + pad,
    height: pad + maxCm * Z + (gridW + gridD) * KY * CELL + pad,
  };
}
