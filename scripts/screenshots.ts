import { chromium, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/';
const KEY = 'zwilling-cube-planner/v1';

const SPACES = [
  {
    id: 'drawer-1',
    name: 'Kitchen drawer',
    kind: 'drawer',
    widthCm: 60,
    depthCm: 45,
    heightCm: 20,
    marginCm: 1,
  },
  {
    id: 'shelf-1',
    name: 'Pantry shelf',
    kind: 'shelf',
    widthCm: 75,
    depthCm: 32,
    heightCm: 34,
    marginCm: 0,
  },
];

/** A mixed hand-stacked layout for the drawer: 5 x 4 cells, 19 cm of headroom. */
const HAND_EDIT = [
  { skuId: '2L', x: 0, y: 0, zCm: 0, w: 2, d: 2, rotated: false },
  { skuId: '2L', x: 0, y: 2, zCm: 0, w: 2, d: 2, rotated: false },
  { skuId: 'M', x: 2, y: 0, zCm: 0, w: 2, d: 1, rotated: false },
  { skuId: 'S', x: 2, y: 0, zCm: 7.6, w: 1, d: 1, rotated: false },
  { skuId: 'S', x: 3, y: 0, zCm: 7.6, w: 1, d: 1, rotated: false },
  { skuId: '2M', x: 2, y: 1, zCm: 0, w: 2, d: 1, rotated: false },
  { skuId: '2L', x: 2, y: 2, zCm: 0, w: 2, d: 2, rotated: false },
  { skuId: '2S', x: 4, y: 0, zCm: 0, w: 1, d: 1, rotated: false },
  { skuId: '2S', x: 4, y: 1, zCm: 0, w: 1, d: 1, rotated: false },
  { skuId: '2S', x: 4, y: 2, zCm: 0, w: 1, d: 1, rotated: false },
  { skuId: '2S', x: 4, y: 3, zCm: 0, w: 1, d: 1, rotated: false },
];

async function seed(page: Page, state: unknown) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, JSON.stringify(value)),
    [KEY, state] as [string, unknown],
  );
  await page.reload();
  await page.waitForSelector('.space-list__item');
}

async function selectSpace(page: Page, name: string) {
  await page.locator('.space-list__item', { hasText: name }).click();
  await page.waitForTimeout(300);
}

/** Crops to the union of the matched elements — flex rows are full-width but their content is not. */
async function shotUnion(page: Page, selector: string, path: string, pad = 8) {
  const boxes = await page.locator(selector).all();
  const rects = (await Promise.all(boxes.map((b) => b.boundingBox()))).filter((r) => r !== null);
  const clip = {
    x: Math.min(...rects.map((r) => r.x)) - pad,
    y: Math.min(...rects.map((r) => r.y)) - pad,
    width: 0,
    height: 0,
  };
  clip.width = Math.max(...rects.map((r) => r.x + r.width)) + pad - clip.x;
  clip.height = Math.max(...rects.map((r) => r.y + r.height)) + pad - clip.y;
  await page.screenshot({ path, clip });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(APP_URL);
  await seed(page, { spaces: SPACES, objective: 'volume', edits: {} });

  await selectSpace(page, 'Kitchen drawer');
  await page.screenshot({ path: `${OUT}overview.png` });
  await page.locator('.shopping').screenshot({ path: `${OUT}shopping-list.png` });

  await selectSpace(page, 'Pantry shelf');
  await page.locator('.iso').screenshot({ path: `${OUT}isometric.png` });

  await seed(page, { spaces: SPACES, objective: 'volume', edits: { 'drawer-1': HAND_EDIT } });
  await selectSpace(page, 'Kitchen drawer');
  // Boxes overlap in the projection, so a plain click is intercepted by the box in front.
  await page
    .locator('.iso__box')
    .filter({ hasText: /^S$/ })
    .first()
    .click({ force: true });
  await page.waitForTimeout(200);
  await shotUnion(page, '.toolbar > *, .iso', `${OUT}edit.png`);

  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(200);
  await shotUnion(page, '.levels > *', `${OUT}top.png`);

  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator('.elevation').screenshot({ path: `${OUT}front.png` });

  await browser.close();
  console.log(`screenshots written to ${OUT}`);
}

void main();
