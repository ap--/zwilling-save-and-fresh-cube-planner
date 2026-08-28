/**
 * Stage 1: discover every product URL in the CUBE Vorratsbehälter category.
 * Writes scripts/.scrape-cache/products.json (gitignored, intermediate artifact).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_URL, autoScroll, dismissConsent, launch, newPage } from './zwilling.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '.scrape-cache/products.json');

const browser = await launch();
const page = await newPage(browser);

console.log('→ opening category page…');
await page.goto(CATEGORY_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await dismissConsent(page);
await page.waitForTimeout(1500);

// Click "Mehr laden" until it disappears, then lazy-scroll.
for (let i = 0; i < 12; i++) {
  await autoScroll(page);
  const more = page
    .getByRole('button', { name: /mehr laden|weitere produkte|load more/i })
    .first();
  if (!(await more.isVisible().catch(() => false))) break;
  await more.click().catch(() => {});
  await page.waitForTimeout(1500);
}
await autoScroll(page);

const products = await page.evaluate(() => {
  const seen = new Map<string, { url: string; name: string; priceText: string }>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.href;
    // PDP urls end in /<numeric-or-sku-id>.html
    if (!/\/de\/.+\/[^/]+\.html(\?|$)/.test(href)) continue;
    const url = href.split('?')[0]!;
    if (seen.has(url)) continue;

    const tile = a.closest('[class*="product"], li, article') ?? a;
    const text = (tile.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!/cube/i.test(text)) continue;

    const name =
      tile.querySelector('[class*="name"], [class*="title"], h2, h3')?.textContent?.trim() ??
      a.textContent?.trim() ??
      '';
    const priceText = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/.exec(text)?.[0] ?? '';
    seen.set(url, { url, name: name.replace(/\s+/g, ' '), priceText });
  }
  return Array.from(seen.values());
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(products, null, 2));
console.log(`✔ found ${products.length} candidate products → ${OUT}`);
for (const p of products) console.log(`   ${p.priceText.padStart(10)}  ${p.name}  ${p.url}`);

await browser.close();
