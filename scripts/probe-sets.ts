/**
 * One-off probe for multi-piece set contents, which the PDP bullets do not spell out.
 * Looks for a bundle/components section and dumps candidate text for inspection.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, autoScroll, dismissConsent, launch, newPage } from './zwilling.ts';

const here = dirname(fileURLToPath(import.meta.url));

const SETS = [
  { id: '1025971', slug: 'zwilling-fresh-save-cube-cube-set-s-%2F-6-tlg-transparent-weiss' },
  { id: '1026082', slug: 'zwilling-fresh-save-cube-cube-set-m-%2F-5-tlg-transparent-weiss' },
  { id: '1025972', slug: 'zwilling-fresh-save-cube-cube-set-s%2Fm-%2F-12-tlg-transparent-weiss' },
  { id: '00268-SET-EU', slug: 'zwilling-cube-set-s-m-boxen-transparent-weiss-%2F-11--tlg.' },
];

const browser = await launch();
const page = await newPage(browser);
const out: Record<string, unknown> = {};

for (const s of SETS) {
  const url = `${BASE}/de/${s.slug}/${s.id}.html`;
  console.log(`\n===== ${s.id} =====`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissConsent(page);
  await autoScroll(page);
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const clean = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

    // Bundle child products are usually rendered as their own tiles on set PDPs.
    const bundleTiles = Array.from(
      document.querySelectorAll('[class*="bundle"], [class*="set-item"], [class*="product-set"]'),
    )
      .map((el) => clean(el.textContent))
      .filter((t) => t.length > 3 && t.length < 400);

    const cubeMentions = Array.from(document.querySelectorAll('li, td, dd, p, h3, h4, span'))
      .filter((el) => el.children.length <= 1)
      .map((el) => clean(el.textContent))
      .filter((t) => /\b(\d\s*[xX×]\s*)?(CUBE\s*)?Box\s*\d?[SML]\b/.test(t))
      .filter((t) => t.length < 200);

    const description = clean(
      document.querySelector('[class*="description"], [class*="long-desc"]')?.textContent,
    ).slice(0, 800);

    return {
      bundleTiles: Array.from(new Set(bundleTiles)).slice(0, 20),
      cubeMentions: Array.from(new Set(cubeMentions)).slice(0, 30),
      description,
    };
  });

  out[s.id] = { url, ...data };
  console.log('cubeMentions:', JSON.stringify(data.cubeMentions, null, 1));
  console.log('description:', data.description.slice(0, 400));
}

const file = resolve(here, '.scrape-cache/sets.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n✔ ${file}`);

await browser.close();
