import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { TripRepository } from '../../data/TripRepository';
import { QuestionnairePage } from './QuestionnairePage';
import { parseAmount } from './questionnaireSteps';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
function renderPage(repo: TripRepository = createMemoryRepository()) {
  render(
    <MemoryRouter initialEntries={['/ia/nouveau']}>
      <TestAppProvider repo={repo}>
        <Routes>
          <Route path="/ia/nouveau" element={<QuestionnairePage today="2026-11-12" />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </TestAppProvider>
    </MemoryRouter>,
  );
  return { repo, u: userEvent.setup() };
}
const next = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('button', { name: /Suivant|Terminer/ }));
const skip = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('button', { name: 'Passer' }));

async function toDates(u: ReturnType<typeof userEvent.setup>) {
  expect(screen.getByRole('heading', { name: 'Où veux-tu aller ?' })).toBeInTheDocument();
  await skip(u);
}
async function fillDates(u: ReturnType<typeof userEvent.setup>, start = '2026-12-20', end = '2026-12-24') {
  await u.type(screen.getByLabelText('Date de départ'), start);
  await u.clear(screen.getByLabelText('Date de retour'));
  await u.type(screen.getByLabelText('Date de retour'), end);
  await next(u);
}

describe('QuestionnairePage', () => {
  it('refuse des dates vides, inversées ou passées', async () => {
    const { u } = renderPage();
    await toDates(u);
    await next(u);
    expect(screen.getByRole('alert')).toHaveTextContent('Indique les dates de départ et de retour.');
    await fillDates(u, '2026-12-24', '2026-12-20');
    expect(screen.getByRole('alert')).toHaveTextContent('La date de retour doit être après le départ.');
    await u.clear(screen.getByLabelText('Date de départ'));
    await u.type(screen.getByLabelText('Date de départ'), '2026-01-01');
    await next(u);
    expect(screen.getByRole('alert')).toHaveTextContent('La date de départ est dans le passé.');
  });

  it('voyageurs : nationalité FR par défaut, au moins un adulte', async () => {
    const { u } = renderPage();
    await toDates(u);
    await fillDates(u);
    await skip(u); // départ
    expect(screen.getByLabelText('Nationalité du voyageur 1')).toHaveValue('FR');
    await u.clear(screen.getByLabelText('Adultes'));
    await u.type(screen.getByLabelText('Adultes'), '0');
    await next(u);
    expect(screen.getByRole('alert')).toHaveTextContent('Il faut au moins un adulte.');
  });

  it('budget : accepte « 1 500,5 », refuse « abc »', async () => {
    expect(parseAmount('1 500,5')).toBe(1500.5);
    expect(parseAmount('abc')).toBeUndefined();
    expect(parseAmount('')).toBeNull();
    const { u } = renderPage();
    await toDates(u);
    await fillDates(u);
    await skip(u);
    await next(u);
    await u.type(screen.getByLabelText(/Budget par personne/), 'abc');
    await next(u);
    expect(screen.getByRole('alert')).toHaveTextContent('Montant invalide.');
  });

  it('« Retour » conserve les réponses', async () => {
    const { u } = renderPage();
    await u.type(screen.getByLabelText('Destination'), 'Kyoto');
    await next(u);
    await u.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByLabelText('Destination')).toHaveValue('Kyoto');
  });


  it('Terminer avec destination → brouillon « known » ; sans → « surprise »', async () => {
    const a = renderPage();
    await a.u.type(screen.getByLabelText('Destination'), 'Kyoto');
    await next(a.u);
    await fillDates(a.u);
    await skip(a.u);
    await next(a.u);
    for (let i = 0; i < 4; i++) await skip(a.u);
    await next(a.u);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/ia\/.+/));
    expect((await a.repo.listDrafts())[0].mode).toBe('known');
  });

  it('sans destination → surprise', async () => {
    const { repo, u } = renderPage();
    await toDates(u);
    await fillDates(u);
    await skip(u);
    await next(u);
    for (let i = 0; i < 4; i++) await skip(u);
    await next(u);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/ia\/.+/));
    const d = (await repo.listDrafts())[0];
    expect([d.mode, d.stage, d.brief.destination]).toEqual(['surprise', 'brief', null]);
  });

  it('échec d’enregistrement : message, réponses conservées, réessayer', async () => {
    const base = createMemoryRepository();
    let fail = true;
    const repo: TripRepository = { ...base, saveDraft: async (d) => { if (fail) throw new Error('panne'); return base.saveDraft(d); } };
    const { u } = renderPage(repo);
    await toDates(u);
    await fillDates(u);
    await skip(u);
    await next(u);
    for (let i = 0; i < 4; i++) await skip(u);
    await next(u);
    expect(await screen.findByText('Enregistrement impossible.')).toBeInTheDocument();
    fail = false;
    await u.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/ia\//));
  });
});

describe('QuestionnairePage — dates liées', () => {
  it('le retour suit le départ sans écraser un retour valide', async () => {
    const { u } = renderPage();
    await skip(u);
    const dep = screen.getByLabelText('Date de départ');
    const ret = screen.getByLabelText('Date de retour');
    await u.type(dep, '2026-12-20');
    expect(ret).toHaveValue('2026-12-20');
    await u.clear(ret);
    await u.type(ret, '2026-12-24');
    await u.clear(dep);
    await u.type(dep, '2026-12-18');
    expect(ret).toHaveValue('2026-12-24');
    await u.clear(dep);
    await u.type(dep, '2026-12-28');
    expect(ret).toHaveValue('2026-12-28');
  });
});
