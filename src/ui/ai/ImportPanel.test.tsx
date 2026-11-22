import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { ITINERARY_FIXTURE } from '../../ai/fixtures';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { TripRepository } from '../../data/TripRepository';
import { ImportPanel } from './ImportPanel';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function setup(repo: TripRepository = createMemoryRepository()) {
  const { container } = render(
    <MemoryRouter initialEntries={['/ia/importer']}>
      <TestAppProvider repo={repo}>
        <Routes>
          <Route path="/ia/importer" element={<ImportPanel />} />
          <Route path="/ia/:draftId" element={<Where />} />
        </Routes>
      </TestAppProvider>
    </MemoryRouter>,
  );
  return { repo, container, u: userEvent.setup() };
}

const file = (content: string, name = 'voyage.json') => new File([content], name, { type: 'application/json' });
const choose = (u: ReturnType<typeof userEvent.setup>, content: string, name?: string) =>
  u.upload(screen.getByLabelText('Fichier à importer'), file(content, name));

const foreign = JSON.stringify({
  trip: 'Lisbon', startDate: '2030-05-10', endDate: '2030-05-11',
  days: [{ date: '2030-05-10', activities: [{ time: '9:30', name: 'Tour' }] }, { date: '2030-05-11', activities: ['Marché'] }],
});

describe('ImportPanel', () => {
  it('accepte .json, .txt, .md', () => {
    setup();
    expect(screen.getByLabelText('Fichier à importer')).toHaveAttribute('accept', '.json,.txt,.md,application/json,text/plain');
  });

  it('fichier v1 : dates demandées, brouillon créé, navigation', async () => {
    const { repo, u } = setup();
    await choose(u, JSON.stringify(ITINERARY_FIXTURE));
    expect(await screen.findByText(/Kyoto express/)).toBeInTheDocument();
    expect(screen.getByText(/3 jours, 5 étapes/)).toBeInTheDocument();
    await u.type(screen.getByLabelText('Date de départ'), '2030-03-01');
    await u.type(screen.getByLabelText('Date de retour'), '2030-03-03');
    await u.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/ia\/[^/]+$/));
    const drafts = await repo.listDrafts();
    expect(drafts).toHaveLength(1);
    expect([drafts[0].stage, drafts[0].brief.startDate, drafts[0].brief.endDate]).toEqual(['itinerary_received', '2030-03-01', '2030-03-03']);
    expect(screen.getByTestId('where').textContent).toBe(`/ia/${drafts[0].id}`);
  });

  it('dates manquantes : demande, rien créé ; retour avant départ refusé', async () => {
    const { repo, u } = setup();
    await choose(u, JSON.stringify(ITINERARY_FIXTURE));
    await u.click(await screen.findByRole('button', { name: 'Créer le brouillon' }));
    expect(await screen.findByText('Indique les dates de départ et de retour.')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Date de départ'), '2030-03-05');
    await u.type(screen.getByLabelText('Date de retour'), '2030-03-03');
    await u.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    expect(await screen.findByText('La date de retour doit être après le départ.')).toBeInTheDocument();
    expect(await repo.listDrafts()).toEqual([]);
  });

  it('JSON étranger : dates et destination pré-remplies, reprend le dernier questionnaire', async () => {
    const repo = createMemoryRepository();
    await repo.saveDraft({
      stage: 'created', mode: 'known', ideas: null, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
      brief: { destination: 'Ancien', startDate: '2020-01-01', endDate: '2020-01-02', departureCity: 'Lyon', adults: 3, children: 0, travelers: [], budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: 'Sans vol de nuit' },
    });
    const { u } = setup(repo);
    await choose(u, foreign);
    expect(await screen.findByLabelText('Date de départ')).toHaveValue('2030-05-10');
    expect(screen.getByLabelText('Date de retour')).toHaveValue('2030-05-11');
    expect(screen.getByLabelText('Destination')).toHaveValue('Lisbon');
    await u.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/ia\//));
    const imported = (await repo.listDrafts()).find((d) => d.stage === 'itinerary_received')!;
    expect([imported.brief.destination, imported.brief.departureCity, imported.brief.constraints, imported.brief.adults]).toEqual(['Lisbon', 'Lyon', 'Sans vol de nuit', 3]);
    expect(imported.itinerary?.days).toHaveLength(2);
  });

  it('fichier inconnu : message et phrase à copier', async () => {
    const { repo, u } = setup();
    await choose(u, 'Jour 1 : Louvre\nJour 2 : Versailles', 'plan.txt');
    expect(await screen.findByText('Je ne reconnais pas ce fichier.')).toBeInTheDocument();
    expect(screen.getByText(/Avec Carnet de route, importe ce voyage \(fichier joint\) du JJ\/MM au JJ\/MM\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /claude\.ai/i })).toHaveAttribute('href', 'https://claude.ai/new');
    await u.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await navigator.clipboard.readText()).toBe('Avec Carnet de route, importe ce voyage (fichier joint) du JJ/MM au JJ/MM.');
    expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).toBeNull();
    expect(await repo.listDrafts()).toEqual([]);
  });

  it('erreurs de validation listées, aucun brouillon', async () => {
    const bad = structuredClone(ITINERARY_FIXTURE);
    bad.days[0].stops[0].startTime = '25:00';
    const { repo, u } = setup();
    await choose(u, JSON.stringify(bad));
    await u.type(await screen.findByLabelText('Date de départ'), '2030-03-01');
    await u.type(screen.getByLabelText('Date de retour'), '2030-03-03');
    await u.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    expect(await screen.findByText(/l’heure « 25:00 » est invalide/)).toBeInTheDocument();
    expect(await repo.listDrafts()).toEqual([]);
  });

  it('le contenu du fichier est affiché comme texte, jamais comme HTML', async () => {
    const { container, u } = setup();
    await choose(u, JSON.stringify({ name: '<img src=x onerror=alert(1)>', days: [{ stops: ['a'] }] }));
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
