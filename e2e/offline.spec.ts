import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('hors ligne : consultation seulement', async ({ page, context }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-02');
  await page.getByRole('link', { name: /Japon/ }).click();
  const day = page.locator('section.day').first();
  await day.getByRole('button', { name: 'Ajouter une étape' }).click();
  await day.getByLabel('Nom de l’étape').fill('Kyoto');
  await day.getByRole('button', { name: 'Ajouter sans carte' }).click();
  await expect(day.getByText('Kyoto', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await expect(page.getByTestId('roadbook-day')).toHaveCount(2);
  await page.goBack();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne — consultation seulement')).toBeVisible();
  await expect(page.getByText('Kyoto', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une étape' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Modifier' }).first()).toBeDisabled();
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await expect(page.getByTestId('roadbook-day')).toHaveCount(2);
  await context.setOffline(false);
});
