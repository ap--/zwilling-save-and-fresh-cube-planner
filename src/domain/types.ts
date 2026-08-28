export type SpaceKind = 'drawer' | 'shelf';

/** How to rank candidate plans. Full coverage of the footprint is always enforced. */
export type Objective = 'volume' | 'price' | 'count';

export interface Space {
  id: string;
  name: string;
  kind: SpaceKind;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  /** Clearance subtracted from every inner dimension (drawer rails, lips, ...). */
  marginCm: number;
}

/** A box footprint on the grid. The 2D packer works purely in these terms. */
export interface Footprint {
  skuId: string;
  /** Grid cell coordinates of the near-left corner. */
  x: number;
  y: number;
  /** Footprint in cells, after any rotation. */
  w: number;
  d: number;
  rotated: boolean;
}

/**
 * A box standing in the space. `zCm` is the height its base sits at and is always
 * derived by settling boxes onto whatever is below them, never set by hand.
 */
export interface Placement extends Footprint {
  zCm: number;
}

export interface Plan {
  spaceId: string;
  objective: Objective;
  /** Every box in the space, in no particular order. */
  placements: Placement[];
  /** Grid size in the space's own orientation: x runs along width, y along depth. */
  gridW: number;
  gridD: number;
  capacityL: number;
  priceEur: number;
  boxCount: number;
  counts: Record<string, number>;
  usedHeightCm: number;
  wastedHeightCm: number;
}

export function usableDims(space: Space): { widthCm: number; depthCm: number; heightCm: number } {
  const shrink = 2 * space.marginCm;
  return {
    widthCm: Math.max(0, space.widthCm - shrink),
    depthCm: Math.max(0, space.depthCm - shrink),
    heightCm: Math.max(0, space.heightCm - space.marginCm),
  };
}
