import { test, expect, type Page } from '@playwright/test';
import { createTrip } from './helpers';

async function addStop(page: Page, dayIndex: number, name: string, address?: string, time?: string) {
  const day = page.locator('section.day').nth(dayIndex);
  await day.getByRole('button', { name: 'Ajouter une étape' }).click();
  await day.getByLabel('Nom de l’étape').fill(name);
  if (time) await day.getByLabel('Heure (facultatif)').fill(time);
  if (address) {
    await day.getByLabel('Adresse').fill(address);
    await day.getByRole('button', { name: new RegExp(address) }).first().click();
    await day.getByRole('button', { name: 'Ajouter l’étape' }).click();
  } else {
    await day.getByRole('button', { name: 'Ajouter sans carte' }).click();
  }
  await expect(day.getByText(name, { exact: true })).toBeVisible();
}

test('itinéraire : trajets calculés, conflit, réordonnancement, lieu sans carte', async ({ page }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-02');
  await page.getByRole('link', { name: /Japon/ }).click();

  await addStop(page, 0, 'Kyoto', 'Kyoto', '09:00');
  await addStop(page, 0, 'Nara', 'Nara');
  const day = page.locator('section.day').first();
  await expect(day.getByTestId('leg')).toHaveCount(1);
  await expect(day.getByTestId('leg')).toContainText(/min|h/);

  // Heure trop tôt pour Nara → conflit.
  await day.getByTestId('stop').nth(1).getByRole('button', { name: 'Modifier' }).click();
  await day.getByLabel('Heure (facultatif)').fill('09:10');
  await day.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(day.getByRole('alert').filter({ hasText: 'Tu arrives à' })).toBeVisible();

  // Réordonner : Nara monte en premier.
  await addStop(page, 0, 'Osaka', 'Osaka');
  await expect(day.getByTestId('leg')).toHaveCount(2);
  await day.getByRole('button', { name: 'Monter Osaka' }).click();
  await expect(day.getByTestId('stop').nth(1)).toContainText('Osaka');
  await expect(day.getByTestId('leg')).toHaveCount(2);

  // Lieu sans carte → trajet à saisir à la main.
  await addStop(page, 0, 'Onsen secret');
  await expect(day.getByLabel('Durée du trajet (min)')).toBeVisible();
  await day.getByLabel('Durée du trajet (min)').fill('25');
  await day.getByLabel('Durée du trajet (min)').press('Enter');
  await expect(day.getByText('saisi')).toBeVisible();
});
