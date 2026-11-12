import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { asReply, ITINERARY_FIXTURE } from '../../ai/fixtures';
import { createMemoryRepository } from '../../data/memoryRepository';
import { DraftPage } from './DraftPage';

describe('DraftPage', () => {
  it('I5 : affiche les avertissements de la réponse collée sur l’écran suivant', async () => {
    const repo = createMemoryRepository();
    const draft = await repo.saveDraft({
      stage: 'brief', mode: 'known', ideas: null, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
      brief: { destination: 'Kyoto', startDate: '2030-03-01', endDate: '2030-03-03', departureCity: null, adults: 1, children: 0, travelers: [], budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '' },
    });
    const it = structuredClone(ITINERARY_FIXTURE);
    it.trip.visa.officialUrl = 'http://pas-https.example.org';
    render(
      <MemoryRouter initialEntries={[`/ia/${draft.id}`]}>
        <TestAppProvider repo={repo}>
          <Routes><Route path="/ia/:draftId" element={<DraftPage />} /></Routes>
        </TestAppProvider>
      </MemoryRouter>,
    );
    const u = userEvent.setup();
    await u.click(await screen.findByLabelText('Réponse de Claude'));
    await u.paste(asReply(it, 'raw'));
    await u.click(screen.getByRole('button', { name: 'Analyser la réponse' }));
    expect(await screen.findByText(/lien officiel du visa ignoré/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recoller une autre réponse' })).toBeInTheDocument();
  });
});
