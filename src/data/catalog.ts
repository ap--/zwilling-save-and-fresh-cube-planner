/**
 * Typed view over the scraped catalog, plus derivation of the CUBE grid model.
 *
 * SKU naming is `<heightMultiplier><footprintLetter>`, e.g. "3M" = M footprint at
 * the 3rd height step. The "/ 11 cm" in product names refers to the footprint's
 * long edge, not the height.
 */
import raw from './catalog.json';
import setContentsJson from './sets.json';

/** Base footprint cell. Every box footprint is an integer multiple of this. */
export const UNIT_CM = 10.7;

export type FootprintLetter = 'S' | 'M' | 'L';

export interface BoxSku {
  /** Short code such as "S", "2S", "3M". */
  id: string;
  productId: string;
  name: string;
  footprint: FootprintLetter;
  /** Footprint in grid cells. */
  w: number;
  d: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  capacityL: number;
  priceEur: number;
  available: boolean;
  url: string;
}

export interface SetProduct {
  productId: string;
  name: string;
  /** Short name, e.g. "Set S/M". */
  label: string;
  /** As advertised — counts lids, inserts and spoons, so it exceeds `boxCount`. */
  pieces: number;
  priceEur: number;
  available: boolean;
  url: string;
  /** Boxes in the set, by SKU id. */
  contents: Record<string, number>;
  boxCount: number;
  capacityL: number;
  /** What the same boxes cost bought individually. */
  singlesEur: number;
}

interface RawProduct {
  id: string;
  kind: 'box' | 'set';
  url: string;
  name: string;
  gtin: string;
  priceEur: number | null;
  available: boolean;
  attributes: Record<string, string>;
  bullets: string[];
}

const rawProducts = (raw as { products: RawProduct[] }).products;

/** Parses a German-formatted number such as "10,70" or "1.234,50". */
function num(s: string | undefined): number | null {
  if (!s) return null;
  const m = /(-?[\d.]*\d)(?:,(\d+))?/.exec(s.trim());
  if (!m) return null;
  const int = m[1]!.replace(/\./g, '');
  return Number(m[2] ? `${int}.${m[2]}` : int);
}

function cm(attrs: Record<string, string>, key: string): number | null {
  const v = attrs[key];
  return v && /cm/i.test(v) ? num(v) : null;
}

/** Capacity in litres, from the attribute block or the "Maße …/ Volumen …" bullet. */
function capacityL(p: RawProduct): number | null {
  const fromAttr = p.attributes['Volumen'];
  if (fromAttr) {
    const n = num(fromAttr);
    if (n !== null) return /\bml\b/i.test(fromAttr) ? n / 1000 : n;
  }
  for (const b of p.bullets) {
    const m = /Volumen:\s*([\d.,]+)\s*(ml|l)\b/i.exec(b);
    if (m) {
      const n = num(m[1]);
      if (n !== null) return m[2]!.toLowerCase() === 'ml' ? n / 1000 : n;
    }
  }
  return null;
}

function toCells(valueCm: number, label: string, sku: string): number {
  const cells = valueCm / UNIT_CM;
  const rounded = Math.round(cells);
  if (rounded < 1 || Math.abs(cells - rounded) > 0.05) {
    throw new Error(
      `Catalog grid violation: ${sku} ${label}=${valueCm}cm is ${cells.toFixed(3)}× ` +
        `UNIT_CM (${UNIT_CM}); expected a near-integer. Re-run \`npm run scrape\` and ` +
        `revisit the grid model.`,
    );
  }
  return rounded;
}

function parseBox(p: RawProduct): BoxSku | null {
  const m = /CUBE Box\s+(\d*)\s*([SML])\s*\//i.exec(p.name);
  if (!m) return null;

  const id = `${m[1] ?? ''}${m[2]!.toUpperCase()}`;
  const widthCm = cm(p.attributes, 'Produktlänge');
  const depthCm = cm(p.attributes, 'Produktbreite');
  const heightCm = cm(p.attributes, 'Produkthöhe');
  const vol = capacityL(p);

  if (widthCm === null || depthCm === null || heightCm === null) {
    throw new Error(`Catalog: ${id} (${p.id}) is missing product dimensions.`);
  }
  if (vol === null) throw new Error(`Catalog: ${id} (${p.id}) is missing a volume.`);
  if (p.priceEur === null) throw new Error(`Catalog: ${id} (${p.id}) is missing a price.`);

  return {
    id,
    productId: p.id,
    name: p.name,
    footprint: m[2]!.toUpperCase() as FootprintLetter,
    w: toCells(widthCm, 'width', id),
    d: toCells(depthCm, 'depth', id),
    widthCm,
    depthCm,
    heightCm,
    capacityL: vol,
    priceEur: p.priceEur,
    available: p.available,
    url: p.url,
  };
}

export const BOXES: BoxSku[] = rawProducts
  .filter((p) => p.kind === 'box')
  .map(parseBox)
  .filter((b): b is BoxSku => b !== null)
  .sort((a, b) => a.heightCm - b.heightCm || a.w * a.d - b.w * b.d);

export const BOX_BY_ID = new Map(BOXES.map((b) => [b.id, b]));

/**
 * Set contents are hand-entered in `sets.json`: the product pages name the sizes a
 * set contains but never the quantities, so they cannot be scraped. A set without
 * an entry there is left out of the catalog entirely — that is how the XS set is
 * excluded, its 7.1 cm boxes not being on the CUBE grid.
 */
const SET_CONTENTS = setContentsJson as Record<
  string,
  { label: string; contents: Record<string, number> }
>;

export const SETS: SetProduct[] = rawProducts
  .filter((p) => p.kind === 'set' && p.priceEur !== null && SET_CONTENTS[p.id])
  .map((p) => {
    const { label, contents } = SET_CONTENTS[p.id]!;
    let boxCount = 0;
    let capacityL = 0;
    let singlesEur = 0;
    for (const [id, qty] of Object.entries(contents)) {
      const box = BOX_BY_ID.get(id);
      if (!box) {
        throw new Error(`sets.json: set ${p.id} lists unknown box "${id}".`);
      }
      boxCount += qty;
      capacityL += qty * box.capacityL;
      singlesEur += qty * box.priceEur;
    }
    return {
      productId: p.id,
      name: p.name,
      label,
      pieces: num(p.attributes['Lieferumfang']) ?? 0,
      priceEur: p.priceEur!,
      available: p.available,
      url: p.url,
      contents,
      boxCount,
      capacityL,
      singlesEur,
    };
  })
  .sort((a, b) => a.priceEur - b.priceEur);

/** Distinct layer heights, ascending. A layer holds boxes of exactly one height. */
export const HEIGHT_STEPS_CM: number[] = [...new Set(BOXES.map((b) => b.heightCm))].sort(
  (a, b) => a - b,
);

export function boxesOfHeight(heightCm: number, includeUnavailable = false): BoxSku[] {
  return BOXES.filter(
    (b) => b.heightCm === heightCm && (includeUnavailable || b.available),
  );
}

/** Any box that physically fits a slot of this height, tallest first. */
export function boxesUpToHeight(maxHeightCm: number, includeUnavailable = false): BoxSku[] {
  return BOXES.filter(
    (b) => b.heightCm <= maxHeightCm + 1e-6 && (includeUnavailable || b.available),
  ).sort((a, b) => b.heightCm - a.heightCm);
}
