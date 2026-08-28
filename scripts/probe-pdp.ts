/**
 * One-off probe: dump the rendered spec area of a single PDP so we can learn
 * the DOM shape before writing the real extractor.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dismissConsent, launch, newPage } from './zwilling.ts';

const here = dirname(fileURLToPath(import.meta.url));
const url =
  process.argv[2] ??
  'https://www.zwilling.com/de/zwilling-fresh-save-cube-cube-box-2s-%2F-11-cm-transparent-weiss/1025122.html';

const browser = await launch();
const page = await newPage(browser);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await dismissConsent(page);
await page.waitForTimeout(1500);

// Expand every collapsible section we can find.
const toggles = page.locator(
  'button[aria-expanded="false"], [role="button"][aria-expanded="false"], summary',
);
const n = await toggles.count();
console.log(`found ${n} collapsed toggles`);
for (let i = 0; i < n; i++) {
  await toggles
    .nth(i)
    .click({ timeout: 2500 })
    .catch(() => {});
  await page.waitForTimeout(200);
}
await page.waitForTimeout(1200);

const dump = await page.evaluate(() => {
  const out: Record<string, unknown> = {};
  out.title = document.title;

  // Any element whose text mentions a dimension keyword.
  const kw = /(Länge|Breite|Höhe|Tiefe|Durchmesser|Volumen|Fassungsvermögen|Maße|Gewicht)/i;
  const hits: { tag: string; cls: string; text: string }[] = [];
  for (const el of Array.from(document.querySelectorAll('li, tr, dt, dd, p, div, span'))) {
    if (el.children.length > 2) continue;
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t.length > 120 || t.length < 4) continue;
    if (!kw.test(t)) continue;
    hits.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), text: t });
  }
  out.dimensionHits = hits.slice(0, 60);

  // Structured JSON-LD, often carries name/sku/price.
  out.jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
    (s) => s.textContent?.slice(0, 1200),
  );
  return out;
});

const outFile = resolve(here, '.scrape-cache/probe.json');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump.dimensionHits, null, 2).slice(0, 6000));
console.log(`\n✔ full dump → ${outFile}`);

await browser.close();
