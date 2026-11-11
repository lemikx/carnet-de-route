import { test, expect, type Locator, type Page } from '@playwright/test';
import { createTrip } from './helpers';

const section = (page: Page, title: string): Locator =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function editLine(page: Page, label: string, amount: string) {
  const prevu = section(page, 'Prévu');
  await prevu.locator('li', { hasText: label }).getByRole('button', { name: 'Modifier' }).click();
  await prevu.getByLabel('Montant', { exact: true }).fill(amount);
  await prevu.getByRole('button', { name: 'Enregistrer' }).click();
}

test('budget : enveloppe, alerte, dépense en yens, conseil, soldes, et rien dans le partage', async ({ page, context }) => {
  await createTrip(page, 'Japon', '2026-12-01', '2026-12-05');
  await page.getByRole('link', { name: /Japon/ }).click();
  await page.getByRole('link', { name: 'Budget' }).click();

  // Voyageurs
  await page.getByLabel('Nombre de voyageurs').fill('3');
  await page.getByLabel('Prénom 1').fill('Alice');
  await page.getByLabel('Prénom 2').fill('Bob');
  await page.getByLabel('Prénom 3').fill('Chloé');
  await page.getByRole('button', { name: 'Commencer' }).click();

  // Enveloppe de 1000 € au total
  await page.getByLabel('Enveloppe maximale (€)').fill('1000');
  await page.getByRole('button', { name: 'Enregistrer l’enveloppe' }).click();

  // Postes habituels, puis Repas 30 € par personne et par jour (450 €) et Activités 200 € par personne (600 €)
  await page.getByRole('button', { name: 'Ajouter les postes habituels' }).click();
  await expect(section(page, 'Prévu').locator('li', { hasText: 'Repas' })).toBeVisible();
  await editLine(page, 'Repas', '30');
  await editLine(page, 'Activités', '200');
  await expect(page.getByTestId('planned-total')).toContainText(/1\s050,00/);
  await expect(page.getByRole('alert').filter({ hasText: /Tu dépasses l’enveloppe de 50,00/ })).toBeVisible();

  // Dépense de 10 000 ¥ payée par Alice pour tous : 61,00 €
  const depenses = section(page, 'Dépenses');
  await depenses.getByRole('button', { name: 'Ajouter une dépense' }).click();
  await depenses.getByLabel('Date').fill('2026-12-01');
  await depenses.getByLabel('Libellé').fill('Ramen');
  await depenses.getByLabel('Montant', { exact: true }).fill('10000');
  await depenses.getByLabel('Devise').selectOption('JPY');
  await expect(depenses.getByLabel(/^Taux/)).toHaveValue('0.0061');
  await expect(depenses.getByText(/≈ 61,00/)).toBeVisible();
  await depenses.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(depenses.getByText('Ramen')).toBeVisible();

  // Soldes : 6100 centimes partagés en 2034 / 2033 / 2033
  const soldes = section(page, 'Soldes');
  await expect(soldes.getByText(/Bob doit 20,33\s€\sà Alice/)).toBeVisible();
  await expect(soldes.getByText(/Chloé doit 20,33\s€\sà Alice/)).toBeVisible();

  // Conseil proportionnel : l'alerte disparaît une fois appliqué
  await expect(page.getByText('Baisser proportionnellement ce qui n’est pas encore dépensé')).toBeVisible();
  await page.getByRole('button', { name: 'Appliquer' }).first().click();
  await expect(page.getByText(/Tu dépasses l’enveloppe/)).toHaveCount(0);

  // Le roadbook partagé ne contient aucune trace du budget
  await page.goto('./');
  await page.getByRole('link', { name: /Japon/ }).click();
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await page.getByRole('button', { name: 'Créer un lien' }).click();
  const url = await page.getByLabel(/Lien en lecture seule/).inputValue();
  const guest = await context.newPage();
  await guest.goto(url);
  await guest.reload();
  await expect(guest.getByRole('heading', { name: 'Japon' })).toBeVisible();
  const text = await guest.locator('body').innerText();
  expect(text).not.toMatch(/budget|enveloppe|1\s?000|Ramen|Repas|Alice|Bob|Chloé/i);
});
