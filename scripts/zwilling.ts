/**
 * Shared Playwright helpers for scraping zwilling.com (Salesforce Commerce Cloud).
 *
 * Two things make this site awkward:
 *  1. A Usercentrics consent overlay blocks interaction until dismissed.
 *  2. Product specs live behind a client-rendered "EIGENSCHAFTEN" accordion,
 *     so a plain HTTP fetch never returns dimensions.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export const BASE = 'https://www.zwilling.com';
export const CATEGORY_URL = `${BASE}/de/kuechenorganisation/vakuumier-system/vorratsbehaelter/`;

const consentHandled = new WeakSet<BrowserContext>();

export async function launch(headless = true): Promise<Browser> {
  return chromium.launch({ headless });
}

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    locale: 'de-DE',
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  // tsx/esbuild compiles named arrow functions with a `__name(...)` helper that
  // does not exist inside page.evaluate. Provide a no-op so evaluated code runs.
  await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
  return context.newPage();
}

/** Dismiss the Usercentrics cookie wall. Only the first call does real work. */
export async function dismissConsent(page: Page): Promise<void> {
  if (consentHandled.has(page.context())) return;

  const candidates = [
    '#usercentrics-root >>> button[data-testid="uc-deny-all-button"]',
    '#usercentrics-root >>> button[data-testid="uc-accept-all-button"]',
    'button[data-testid="uc-deny-all-button"]',
    'button[data-testid="uc-accept-all-button"]',
  ];
  for (const sel of candidates) {
    try {
      const btn = page.locator(sel).first();
      await btn.waitFor({ state: 'visible', timeout: 4000 });
      await btn.click({ timeout: 4000 });
      await page.waitForTimeout(500);
      consentHandled.add(page.context());
      return;
    } catch {
      // try next selector
    }
  }
  // Fallback: match by visible label.
  for (const name of [/ABLEHNEN/i, /ALLES AKZEPTIEREN/i, /Accept All/i]) {
    try {
      const btn = page.getByRole('button', { name }).first();
      await btn.waitFor({ state: 'visible', timeout: 3000 });
      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      consentHandled.add(page.context());
      return;
    } catch {
      // no consent banner present
    }
  }
  consentHandled.add(page.context());
}

/** Scroll to the bottom in steps so lazy-loaded tiles/sections render. */
export async function autoScroll(page: Page, step = 800, maxSteps = 40): Promise<void> {
  let previous = -1;
  for (let i = 0; i < maxSteps; i++) {
    const height = await page.evaluate((s) => {
      window.scrollBy(0, s);
      return document.body.scrollHeight;
    }, step);
    await page.waitForTimeout(350);
    if (height === previous && i > 3) break;
    previous = height;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
