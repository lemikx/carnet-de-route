import { expect, type Page } from '@playwright/test';

export async function createTrip(page: Page, name: string, start: string, end: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Nouveau voyage' }).click();
  await page.getByLabel('Nom du voyage').fill(name);
  await page.getByLabel('Date de départ').fill(start);
  await page.getByLabel('Date de retour').fill(end);
  await page.getByRole('button', { name: 'Créer le voyage' }).click();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
}
