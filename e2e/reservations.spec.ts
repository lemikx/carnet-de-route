import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('réservation de vol, copie du numéro et contact', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await page.getByLabel('N° de confirmation').fill('XK7Q2P');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  const card = page.getByTestId('reservation');
  await expect(card).toContainText('AF276');
  await card.getByRole('button', { name: 'Copier le n°' }).click();
  await expect(card.getByRole('button', { name: 'Copié' })).toBeVisible();

  await page.getByRole('link', { name: 'Itinéraire' }).click();
  const days = page.locator('section.day');
  await expect(days.nth(0)).toContainText('Départ : Paris');
  await expect(days.nth(1)).toContainText('Arrivée : Tokyo');
  await expect(days.nth(0).getByTestId('leg')).toContainText('12 h');

  await page.getByRole('link', { name: 'Contacts' }).click();
  await page.getByRole('button', { name: 'Ajouter un contact' }).click();
  await page.getByLabel('Nom').fill('Ambassade de France');
  await page.getByLabel('Téléphone').fill('+81 3 5798 6000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Ambassade de France')).toBeVisible();
});
