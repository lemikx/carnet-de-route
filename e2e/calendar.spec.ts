import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createTrip } from './helpers';

test('télécharger le calendrier d’un voyage avec un vol', async ({ page }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-03');
  await page.getByRole('link', { name: /Japon/ }).click();
  await page.getByRole('link', { name: 'Réservations' }).click();
  await page.getByRole('button', { name: 'Ajouter une réservation' }).click();
  await page.getByLabel('Type').selectOption('flight');
  await page.getByLabel('Titre').fill('AF276');
  await page.getByLabel('Lieu de départ').fill('Paris');
  await page.getByRole('button', { name: /Paris, France/ }).click();
  await page.getByLabel('Lieu d’arrivée').fill('Tokyo');
  await page.getByRole('button', { name: /Tokyo, Japon/ }).click();
  await page.getByLabel('Date de départ').fill('2026-12-01');
  await page.getByLabel('Heure de départ').fill('10:00');
  await page.getByLabel('Date d’arrivée').fill('2026-12-02');
  await page.getByLabel('Heure d’arrivée').fill('06:00');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('reservation')).toBeVisible();

  await page.getByRole('button', { name: 'Calendrier' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger (.ics)' }).click()]);
  expect(download.suggestedFilename()).toBe('Japon.ics');
  const ics = readFileSync((await download.path())!, 'utf8').replace(/\r\n /g, '');
  expect(ics).toContain('✈️');
  expect(ics).toContain('DTSTART:20261201T090000Z');
  expect(ics).toContain('DTEND:20261201T210000Z');
  await expect(page.getByText('Abonnement disponible une fois l’appli reliée à Supabase.')).toBeVisible();
});
