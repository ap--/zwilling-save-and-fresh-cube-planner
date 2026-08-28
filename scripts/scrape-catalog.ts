/**
 * Stage 2: scrape real specs for every in-scope CUBE product and write
 * src/data/catalog.json (committed — the app never scrapes at runtime).
 *
 * Run with: npm run scrape
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { BASE, dismissConsent, launch, newPage, sleep } from './zwilling.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/data/catalog.json');

type Kind = 'box' | 'set';

const TARGETS: { id: string; kind: Kind; slug: string }[] = [
  // ---- single boxes, 11 cm family ----
  { id: '1025079', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-s-%2F-11-cm-transparent-weiss' },
  { id: '1025122', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-2s-%2F-11-cm-transparent-weiss' },
  { id: '1025124', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-3s-%2F-11-cm-transparent-weiss' },
  { id: '1025125', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-4s-%2F-11-cm-transparent-weiss' },
  // ---- single boxes, 21 cm family ----
  { id: '1025126', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-m-%2F-21-cm-transparent-weiss' },
  { id: '1025127', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-2m-%2F-21-cm-transparent-weiss' },
  { id: '1025128', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-3m-%2F-21-cm-transparent-weiss' },
  { id: '1025129', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-l-%2F-21-cm-transparent-weiss' },
  { id: '1026144', kind: 'box', slug: 'zwilling-fresh-save-cube-cube-box-2l-%2F-21-cm-transparent-weiss' },
  // ---- sets ----
  { id: '1025149', kind: 'set', slug: 'zwilling-fresh-save-cube-cube-set-xs-%2F-3-tlg-transparent-weiss' },
  { id: '1025971', kind: 'set', slug: 'zwilling-fresh-save-cube-cube-set-s-%2F-6-tlg-transparent-weiss' },
  { id: '1026082', kind: 'set', slug: 'zwilling-fresh-save-cube-cube-set-m-%2F-5-tlg-transparent-weiss' },
  { id: '1025972', kind: 'set', slug: 'zwilling-fresh-save-cube-cube-set-s%2Fm-%2F-12-tlg-transparent-weiss' },
  { id: '00268-SET-EU', kind: 'set', slug: 'zwilling-cube-set-s-m-boxen-transparent-weiss-%2F-11--tlg.' },
];

export interface ScrapedProduct {
  id: string;
  kind: Kind;
  url: string;
  name: string;
  gtin: string;
  priceEur: number | null;
  available: boolean;
  /** Raw label -> value pairs from the "Abmessungen" block, e.g. "Produktlänge" -> "10,70 cm". */
  attributes: Record<string, string>;
  /** Marketing bullets; the "Maße: A x B x C cm / Volumen: N ml" line lives here. */
  bullets: string[];
}

async function scrapeOne(page: Page, t: (typeof TARGETS)[number]): Promise<ScrapedProduct> {
  const url = `${BASE}/de/${t.slug}/${t.id}.html`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissConsent(page);
  // Specs are present in the DOM even while the accordion is visually collapsed,
  // so we just wait for the container instead of clicking every toggle.
  await page
    .waitForSelector('.product-main-attributes, .dimensions-content', { timeout: 20_000 })
    .catch(() => {});

  const data = await page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

    const attributes: Record<string, string> = {};
    for (const li of Array.from(
      document.querySelectorAll('.product-main-attributes li.attribute, .dimensions-content li'),
    )) {
      const label = clean(li.querySelector('.label')?.textContent).replace(/:$/, '');
      if (!label) continue;
      const value = clean(li.textContent).slice(clean(li.querySelector('.label')?.textContent).length).trim();
      if (value) attributes[label] = value;
    }

    const bullets = Array.from(document.querySelectorAll('li'))
      .map((li) => clean(li.textContent))
      .filter((t) => /Maße|Volumen|Fassungsvermögen|cm|ml/i.test(t))
      .filter((t) => t.length > 5 && t.length < 160);

    let name = '';
    let gtin = '';
    let priceEur: number | null = null;
    let available = true;
    for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const j = JSON.parse(s.textContent ?? '');
        if (j['@type'] !== 'Product') continue;
        name = j.name ?? name;
        gtin = j.gtin ?? j.gtin13 ?? gtin;
        const offers = Array.isArray(j.offers) ? j.offers[0] : j.offers;
        if (offers) {
          const p = Number(offers.price);
          if (Number.isFinite(p)) priceEur = p;
          if (typeof offers.availability === 'string') {
            available = !/OutOfStock|SoldOut/i.test(offers.availability);
          }
        }
      } catch {
        /* malformed ld+json — ignore */
      }
    }
    if (!name) name = clean(document.querySelector('h1')?.textContent);

    // Fallback price straight off the PDP if ld+json had none.
    if (priceEur === null) {
      const txt = clean(document.querySelector('.price, [class*="product-price"]')?.textContent);
      const m = /(\d{1,3}(?:\.\d{3})*),(\d{2})\s*€/.exec(txt);
      if (m) priceEur = Number(`${m[1]!.replace(/\./g, '')}.${m[2]}`);
    }

    const bodyText = clean(document.body.textContent).slice(0, 200000);
    if (/ausverkauft|nicht verfügbar|derzeit nicht/i.test(bodyText.slice(0, 20000))) {
      available = false;
    }

    return { name, gtin, priceEur, available, attributes, bullets: Array.from(new Set(bullets)) };
  });

  return { id: t.id, kind: t.kind, url, ...data };
}

const browser = await launch();
const page = await newPage(browser);
const results: ScrapedProduct[] = [];

for (const t of TARGETS) {
  process.stdout.write(`→ ${t.id} … `);
  try {
    const p = await scrapeOne(page, t);
    results.push(p);
    const dims = ['Produktlänge', 'Produktbreite', 'Produkthöhe']
      .map((k) => p.attributes[k] ?? '?')
      .join(' × ');
    console.log(`${p.name || '(no name)'} | ${p.priceEur ?? '?'} € | ${dims}`);
  } catch (err) {
    console.log(`FAILED: ${(err as Error).message}`);
  }
  await sleep(1200); // be polite
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ scrapedAt: new Date().toISOString(), source: BASE, products: results }, null, 2),
);
console.log(`\n✔ ${results.length}/${TARGETS.length} products → ${OUT}`);

await browser.close();
