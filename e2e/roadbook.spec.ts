import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('roadbook affiché et exportable en PDF', async ({ page }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-03');
  await page.getByRole('link', { name: /Japon/ }).click();
  const day = page.locator('section.day').first();
  await day.getByRole('button', { name: 'Ajouter une étape' }).click();
  await day.getByLabel('Nom de l’étape').fill('Kyoto');
  await day.getByRole('button', { name: 'Ajouter sans carte' }).click();
  await expect(day.getByText('Kyoto', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Roadbook' }).click();
  await expect(page.getByRole('heading', { name: 'Japon' })).toBeVisible();
  await expect(page.getByTestId('roadbook-day')).toHaveCount(3);
  await expect(page.getByText('Aucune étape prévue')).toHaveCount(2);

  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4' });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(1 + 1 + 3 + 1); // couverture, vue d'ensemble, 3 jours, annexes
});
