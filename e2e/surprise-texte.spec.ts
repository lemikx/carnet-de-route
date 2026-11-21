import { test, expect } from '@playwright/test';

test('« surprends-moi » écrit dans la destination → demande de 3 idées', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Créer avec l’IA' }).click();
  await page.getByLabel('Destination').fill('surprends-moi');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel('Date de départ').fill('2030-03-01');
  await page.getByLabel('Date de retour').fill('2030-03-08');
  await page.getByRole('button', { name: 'Suivant' }).click();
  for (let i = 0; i < 8; i++) {
    const done = page.getByRole('button', { name: 'Terminer' });
    if (await done.isVisible()) break;
    const skip = page.getByRole('button', { name: 'Passer' });
    if (await skip.isVisible()) await skip.click(); else await page.getByRole('button', { name: 'Suivant' }).click();
  }
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByLabel('Demande à copier')).toHaveValue(/Propose-moi exactement 3 idées/);
});
