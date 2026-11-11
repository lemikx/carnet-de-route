import { test, expect } from '@playwright/test';

test('la page d’accueil a le bon titre', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Carnet de route');
  await expect(page.getByRole('link', { name: 'Carnet de route' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mes voyages' })).toBeVisible();
});
