import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'tmp', 'opendesign-reference', 'screenshots');
await fs.mkdir(outDir, { recursive: true });

const executableCandidates = [
  process.env.PLAYWRIGHT_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

let executablePath;
for (const candidate of executableCandidates) {
  try {
    await fs.access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next installed browser candidate.
  }
}

const browser = await chromium.launch({
  executablePath,
});
const page = await browser.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const baseUrl = process.env.PWA_URL ?? 'http://127.0.0.1:5173/';

async function waitReady() {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(350);
}

async function shot(name) {
  await waitReady();
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: true,
  });
}

async function clickText(text) {
  await page.getByText(text, { exact: true }).last().click();
  await waitReady();
}

await page.goto(baseUrl);
await waitReady();

await shot('01-team-page');

await page.getByText(/烈咬陆鲨|炽焰咆哮虎/).first().click().catch(() => {});
await waitReady();
const editMember = page.getByTitle('编辑成员').first();
if (await editMember.count()) {
  await editMember.click();
  await shot('02-member-editor-sheet');
  const close = page.getByTitle('关闭').first();
  if (await close.count()) await close.click();
  await waitReady();
}

await page.locator('nav button').nth(1).click();
await waitReady();
await shot('03-damage-calculator');
const abilityConfig = page.getByRole('button', { name: /能力配置|展开能力配置/ }).first();
if (await abilityConfig.count()) {
  await abilityConfig.click();
  await shot('04-damage-calculator-expanded-config');
}

await page.locator('nav button').nth(2).click();
await waitReady();
await shot('05-speed-line-top');
await page.mouse.wheel(0, 650);
await shot('06-speed-line-benchmarks');

await page.locator('nav button').nth(3).click();
await waitReady();
await shot('07-rule-dex-list');
const firstPokemonCard = page.locator('button, [role="button"]').filter({ hasText: /烈咬陆鲨|喷火龙|妙蛙花|玛狃拉/ }).first();
if (await firstPokemonCard.count()) {
  await firstPokemonCard.click().catch(() => {});
  await shot('08-rule-dex-detail');
}

await page.locator('nav button').nth(4).click();
await waitReady();
await shot('09-settings-page');

await browser.close();
