import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const readSamples = async (fileName: string) => {
  const raw = await readFile(new URL(`../../src/data/external/vgcpastes/${fileName}`, import.meta.url), 'utf8');
  return JSON.parse(raw) as unknown[];
};

test('renders the generated VGCPastes team library', async ({ page, context }) => {
  const [maSamples, mbSamples] = await Promise.all([
    readSamples('reg_ma_champions_ma_team_samples.json'),
    readSamples('reg_mb_champions_mb_team_samples.json'),
  ]);
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '环境', exact: true })).toBeVisible();

  const browseButton = page.getByRole('button', { name: '查看全部队伍' });
  await browseButton.scrollIntoViewIfNeeded();
  await browseButton.click();
  await expect(page.getByRole('heading', { name: '队伍一览', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '赛事', exact: true }).click();
  await expect(page.getByText(`${maSamples.length + mbSamples.length} 支队伍`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'M-B', exact: true }).click();
  await expect(page.getByText(`${mbSamples.length} 支队伍`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入配置' }).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => message.includes('VGCPastes'))).toEqual([]);
});
