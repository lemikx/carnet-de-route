import { test, expect, type Page } from '@playwright/test';
import { asReply, IDEAS_FIXTURE, ITINERARY_FIXTURE } from '../src/ai/fixtures';

const next = (page: Page) => page.getByRole('button', { name: /^(Suivant|Terminer)$/ }).click();
const skip = (page: Page) => page.getByRole('button', { name: 'Passer' }).click();

async function questionnaire(page: Page, destination: string | null) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Créer avec l’IA' }).click();
  if (destination) {
    await page.getByLabel('Destination').fill(destination);
    await next(page);
  } else await skip(page);
  await page.getByLabel('Date de départ').fill('2030-03-01');
  await expect(page.getByLabel('Date de retour')).toHaveValue('2030-03-01');
  await page.getByLabel('Date de retour').fill('2030-03-03');
  await next(page);
  await skip(page); // ville de départ
  await next(page); // voyageurs (2 adultes FR par défaut)
  for (let i = 0; i < 4; i++) await skip(page); // budget, profil, hébergement, rythme
  await page.getByLabel('Contraintes').fill('Sans vol de nuit');
  await next(page);
}

async function pasteAndAnalyse(page: Page, reply: string) {
  await page.getByLabel('Réponse de Claude').fill(reply);
  await page.getByRole('button', { name: 'Analyser la réponse' }).click();
}

test('« Surprends-moi » : questionnaire, idées, itinéraire, voyage créé', async ({ page, context }) => {
  await questionnaire(page, null);
  await expect(page.getByLabel('Demande à copier')).toHaveValue(/recherche web/);
  await expect(page.getByLabel('Demande à copier')).toHaveValue(/Sans vol de nuit/);

  await pasteAndAnalyse(page, asReply(IDEAS_FIXTURE, 'text'));
  const cards = page.locator('li.idea-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.last()).toContainText('Lagos');
  await expect(cards.last()).toHaveClass(/muted/);
  await expect(cards.filter({ hasText: 'Kyoto' }).getByText('Meilleure période')).toBeVisible();
  await expect(cards.filter({ hasText: 'Kyoto' }).getByText('Tes dates tombent en bonne période.')).toBeVisible();

  await cards.filter({ hasText: 'Kyoto' }).getByRole('button', { name: 'Choisir cette idée' }).click();
  await expect(page.getByLabel('Demande à copier')).toHaveValue(/Kyoto/);
  await pasteAndAnalyse(page, asReply(ITINERARY_FIXTURE));
  await expect(page.getByText('3 jours, 5 étapes')).toBeVisible();
  await expect(page.getByText('Meilleure période')).toBeVisible();
  await expect(page.getByText(/Faire le visa avant le 12\/02\/2030/)).toBeVisible();

  await page.getByRole('button', { name: 'Créer le voyage' }).click();
  await page.getByRole('link', { name: 'Ouvrir le voyage' }).click();
  await expect(page.getByRole('heading', { name: 'Kyoto express' })).toBeVisible();
  await expect(page.getByText('Fushimi Inari').first()).toBeVisible();

  await page.getByRole('link', { name: 'Checklist' }).click();
  await expect(page.getByText('Visa / autorisation d’entrée')).toBeVisible();
  await page.getByRole('link', { name: 'Budget' }).click();
  await expect(page.getByText('Hôtel').first()).toBeVisible();
  await expect(page.locator('input[value="Voyageur 1"]')).toHaveCount(1);

  // Le roadbook partagé ne révèle rien du questionnaire ni du budget.
  await page.getByRole('link', { name: 'Roadbook' }).click();
  await page.getByRole('button', { name: 'Créer un lien' }).click();
  const url = await page.getByLabel(/Lien en lecture seule/).inputValue();
  const guest = await context.newPage();
  await guest.goto(url);
  await guest.reload();
  await expect(guest.getByRole('heading', { name: 'Kyoto express' })).toBeVisible();
  expect(await guest.locator('body').innerText()).not.toMatch(/nationalité|vol de nuit|budget|Voyageur 1/i);
});

test('« Je sais où aller » : pas d’étape idées', async ({ page }) => {
  await questionnaire(page, 'Kyoto');
  await expect(page.getByRole('heading', { name: /itinéraire/i })).toBeVisible();
  await pasteAndAnalyse(page, asReply(ITINERARY_FIXTURE, 'raw'));
  await expect(page.getByText('Meilleure période')).toBeVisible();
  await page.getByRole('button', { name: 'Créer le voyage' }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le voyage' })).toBeVisible();
});

test('réponse invalide : message précis, brouillon repris puis supprimé', async ({ page }) => {
  await questionnaire(page, 'Kyoto');
  await pasteAndAnalyse(page, 'Désolé, je ne peux pas aider.');
  await expect(page.getByRole('alert')).toContainText('bloc JSON');
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Brouillons IA' })).toBeVisible();
  await expect(page.getByText('Aucun voyage pour l’instant')).toBeVisible();
  await page.getByRole('link', { name: 'Reprendre' }).click();
  await expect(page.getByLabel('Demande à copier')).toBeVisible();
  await page.goto('./');
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('heading', { name: 'Brouillons IA' })).toHaveCount(0);
});
