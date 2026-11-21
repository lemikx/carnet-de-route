import { test, expect } from '@playwright/test';

test('retour du lien de connexion : pas d’erreur 404', async ({ page }) => {
  await page.goto('./#access_token=abc&refresh_token=def&type=magiclink');
  await expect(page.getByRole('heading', { name: 'Mes voyages' })).toBeVisible();
  await expect(page.getByText('404')).toHaveCount(0);
});

test('lien expiré : message clair', async ({ page }) => {
  await page.goto('./#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByRole('alert')).toContainText('Ce lien de connexion a expiré ou a déjà servi.');
});
