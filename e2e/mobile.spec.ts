import { test, expect } from '@playwright/test';

test('mobile 375 px : les pastilles du questionnaire restent en ligne, sans défilement horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Créer avec l’IA' }).click();
  await page.getByRole('button', { name: 'Passer' }).click(); // destination
  await page.getByLabel('Date de départ').fill('2030-03-01');
  await page.getByLabel('Date de retour').fill('2030-03-03');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Passer' }).click(); // ville de départ
  await page.getByRole('button', { name: 'Suivant' }).click(); // voyageurs
  await page.getByRole('button', { name: 'Passer' }).click(); // budget
  await expect(page.getByRole('heading', { name: 'Quel voyageur es-tu ?' })).toBeVisible();

  const chips = page.locator('label.chip');
  expect(await chips.count()).toBeGreaterThan(10);
  for (const h of await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(h).toBeLessThanOrEqual(48);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
