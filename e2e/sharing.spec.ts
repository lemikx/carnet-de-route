import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('partage du roadbook par lien', async ({ page, context }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-02');
  await page.getByRole('link', { name: /Japon/ }).click();
  await page.getByRole('link', { name: 'Réservations' }).click();
  await page.getByRole('button', { name: 'Ajouter une réservation' }).click();
  await page.getByLabel('Type').selectOption('lodging');
  await page.getByLabel('Titre').fill('Hôtel Sakura');
  await page.getByLabel('Date de check-in').fill('2026-12-01');
  await page.getByLabel('Heure de check-in').fill('15:00');
  await page.getByLabel('N° de confirmation').fill('CONF-999');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('CONF-999')).toBeVisible();

  await page.getByRole('link', { name: 'Roadbook' }).click();
  await page.getByRole('button', { name: 'Créer un lien' }).click();
  const url = await page.getByLabel(/Lien en lecture seule/).inputValue();

  // Ouverture par un proche (lecture seule, sans infos sensibles).
  const guest = await context.newPage();
  await guest.goto(url);
  await expect(guest.getByText(/Roadbook partagé par/)).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Japon' })).toBeVisible();
  await expect(guest.getByText('Hôtel Sakura').first()).toBeVisible();
  await expect(guest.getByText('CONF-999')).toHaveCount(0);
  await expect(guest.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // Le propriétaire modifie le voyage → visible après rechargement.
  await page.getByRole('link', { name: '← Retour au voyage' }).click();
  const day = page.locator('section.day').nth(1);
  await day.getByRole('button', { name: 'Ajouter une étape' }).click();
  await day.getByLabel('Nom de l’étape').fill('Fushimi Inari');
  await day.getByRole('button', { name: 'Ajouter sans carte' }).click();
  await expect(day.getByText('Fushimi Inari')).toBeVisible();
  await guest.reload();
  await expect(guest.getByText('Fushimi Inari')).toBeVisible();

  // Nouveau lien → l'ancien ne marche plus.
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await page.getByRole('button', { name: 'Nouveau lien' }).click();
  await expect(page.getByLabel(/Lien en lecture seule/)).not.toHaveValue(url);
  const url2 = await page.getByLabel(/Lien en lecture seule/).inputValue();
  await guest.reload();
  await expect(guest.getByText('Ce roadbook n’est plus partagé.')).toBeVisible();

  // Désactiver → le nouveau lien ne marche plus non plus.
  await page.getByRole('button', { name: 'Désactiver le lien' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.getByRole('button', { name: 'Créer un lien' })).toBeVisible();
  await guest.goto(url2);
  await guest.reload(); // mode démo : données relues depuis le stockage local
  await expect(guest.getByText('Ce roadbook n’est plus partagé.')).toBeVisible();
});
