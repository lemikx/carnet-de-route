import { test, expect } from '@playwright/test';
import { createTrip } from './helpers';

test('créer, renommer, dupliquer et supprimer un voyage', async ({ page }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-05');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Nom du voyage').fill('Japon en famille');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Japon en famille', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Dupliquer' }).click();
  await expect(page.getByText('Japon en famille (copie)')).toBeVisible();

  await page.getByRole('button', { name: 'Supprimer' }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Japon en famille (copie)')).toHaveCount(0);
  await expect(page.getByText('Japon en famille', { exact: true })).toBeVisible();
});

test('raccourcir les dates demande confirmation si un jour retiré contient une étape', async ({ page }) => {
  await createTrip(page, 'Islande', '2027-06-01', '2027-06-04');
  await page.getByRole('link', { name: /Islande/ }).click();
  await page.getByRole('button', { name: 'Ajouter une étape' }).first().click();
  await page.getByLabel('Nom de l’étape').fill('Reykjavik');
  await page.getByRole('button', { name: 'Ajouter sans carte' }).click();
  await expect(page.getByText('Reykjavik')).toBeVisible();

  await page.getByRole('link', { name: 'Carnet de route' }).click();
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Date de départ').fill('2027-06-02');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('mardi 1 juin');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('01/06/2027 → 04/06/2027')).toBeVisible();
});
