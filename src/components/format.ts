import type { BoxSku } from '../data/catalog';

const HUE: Record<string, number> = { S: 205, M: 145, L: 35 };

function tone(sku: BoxSku): { hue: number; lightness: number } {
  const hue = HUE[sku.footprint] ?? 260;
  const step = Math.round(sku.heightCm / 7.6);
  return { hue, lightness: 62 - (step - 1) * 8 };
}

/** Footprint letter sets the hue; height step sets the lightness. */
export function skuColor(sku: BoxSku): string {
  const { hue, lightness } = tone(sku);
  return `hsl(${hue} 55% ${lightness}%)`;
}

/** Isometric shading: the lit top, then the two faces turned away from the light. */
export function skuFaces(sku: BoxSku): { top: string; left: string; right: string } {
  const { hue, lightness } = tone(sku);
  return {
    top: `hsl(${hue} 55% ${Math.min(92, lightness + 10)}%)`,
    left: `hsl(${hue} 55% ${lightness}%)`,
    right: `hsl(${hue} 55% ${Math.max(14, lightness - 13)}%)`,
  };
}


export function eur(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function litres(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 2 })} l`;
}
