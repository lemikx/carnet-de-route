import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('parcours complet : du voyage au roadbook partagé', async ({ page, context }) => {
  await createTrip(page, 'Paris → Japon', '2026-12-01', '2026-12-05');
  await page.getByRole('link', { name: /Paris → Japon/ }).click();

  // Vol aller et hôtel.
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
  await expect(page.getByTestId('reservation')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ajouter une réservation' }).click();
  await page.getByLabel('Type').selectOption('lodging');
  await page.getByLabel('Titre').fill('Hôtel Kyoto');
  await page.getByLabel('Adresse de l’hébergement').fill('Kyoto');
  await page.getByRole('button', { name: /Kyoto, Japon/ }).click();
  await page.getByLabel('Date de check-in').fill('2026-12-03');
  await page.getByLabel('Heure de check-in').fill('15:00');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('reservation')).toHaveCount(2);

  // Trois activités le 3 décembre, avec un conflit puis sa correction.
  await page.getByRole('link', { name: 'Itinéraire' }).click();
  const day3 = page.locator('section.day').nth(2);
  for (const [name, time] of [['Nara', '09:00'], ['Osaka', '09:30']] as const) {
    await day3.getByRole('button', { name: 'Ajouter une étape' }).click();
    await day3.getByLabel('Nom de l’étape').fill(name);
    await day3.getByLabel('Heure (facultatif)').fill(time);
    await day3.getByLabel('Adresse').fill(name);
    await day3.getByRole('button', { name: new RegExp(name) }).first().click();
    await day3.getByRole('button', { name: 'Ajouter l’étape' }).click();
    await expect(day3.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(day3.getByRole('alert').filter({ hasText: 'Tu arrives à' })).toBeVisible();
  await day3.getByTestId('stop').filter({ hasText: 'Osaka' }).getByRole('button', { name: 'Modifier' }).click();
  await day3.getByLabel('Heure (facultatif)').fill('13:00');
  await day3.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(day3.getByRole('alert').filter({ hasText: 'Tu arrives à' })).toHaveCount(0);

  // Checklist et contact.
  await page.getByRole('link', { name: 'Checklist' }).click();
  for (const label of ['Assurance voyage', 'Adaptateur de prise', 'Chargeurs']) await page.getByLabel(label, { exact: true }).check();
  await expect(page.getByText('3/15 faits')).toBeVisible();
  await page.getByRole('link', { name: 'Contacts' }).click();
  await page.getByRole('button', { name: 'Ajouter un contact' }).click();
  await page.getByLabel('Nom').fill('Ambassade de France à Tokyo');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // Roadbook, calendrier, lien partagé.
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await expect(page.getByTestId('roadbook-day')).toHaveCount(5);
  await expect(page.getByText('Ambassade de France à Tokyo')).toBeVisible();
  await page.getByRole('button', { name: 'Créer un lien' }).click();
  const url = await page.getByLabel(/Lien en lecture seule/).inputValue();
  const guest = await context.newPage();
  await guest.goto(url);
  await expect(guest.getByRole('heading', { name: 'Paris → Japon' })).toBeVisible();

  await page.getByRole('link', { name: '← Retour au voyage' }).click();
  await page.getByRole('button', { name: 'Calendrier' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger (.ics)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Suppression du voyage → le lien partagé ne montre plus rien.
  await page.getByRole('link', { name: 'Carnet de route' }).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Aucun voyage pour l’instant')).toBeVisible();
  await guest.reload();
  await expect(guest.getByText('Ce roadbook n’est plus partagé.')).toBeVisible();
});
