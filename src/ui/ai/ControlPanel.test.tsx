import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ITINERARY_FIXTURE } from '../../ai/fixtures';
import type { AiDraft } from '../../ai/types';
import { ControlPanel } from './ControlPanel';

const draft = (endDate = '2026-12-22'): AiDraft => ({
  id: 'd1', stage: 'itinerary_received', mode: 'known', ideas: null, chosenIdeaId: null, itinerary: structuredClone(ITINERARY_FIXTURE), tripId: null, protocolVersion: 1, updatedAt: '',
  brief: {
    destination: 'Kyoto', startDate: '2026-12-20', endDate, departureCity: null, adults: 2, children: 0, travelers: [], budgetPerPersonEur: null,
    travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
  },
});
const show = (d: AiDraft, onCreate: React.ComponentProps<typeof ControlPanel>['onCreate']) =>
  render(<MemoryRouter><ControlPanel draft={d} today="2026-11-12" onCreate={onCreate} /></MemoryRouter>);

describe('ControlPanel', () => {
  it('résume jours, étapes, visa et avertissement de dates', () => {
    show(draft('2026-12-24'), async () => ({ tripId: 't', toVerify: 0, skippedBudgetLines: 0 }));
    expect(screen.getByText('3 jours, 5 étapes')).toBeInTheDocument();
    expect(screen.getByText('3 jours proposés pour 5 dates')).toBeInTheDocument();
    expect(screen.getByText('Faire le visa avant le 03/12/2026')).toBeInTheDocument();
  });
  it('progression puis lien vers le voyage et lieux à vérifier', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const onCreate = vi.fn(async (p: (d: number, t: number) => void) => {
      p(3, 7);
      await gate;
      return { tripId: 'abc', toVerify: 2, skippedBudgetLines: 0 };
    });
    show(draft(), onCreate);
    await userEvent.click(screen.getByRole('button', { name: 'Créer le voyage' }));
    expect(await screen.findByText(/3 \/ 7/)).toBeInTheDocument();
    release();
    expect(await screen.findByText('2 lieux à vérifier')).toHaveAttribute('href', '/voyage/abc/itineraire');
  });
  it('échec : message puis réessai', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ tripId: 'abc', toVerify: 0, skippedBudgetLines: 0 });
    show(draft(), onCreate);
    await userEvent.click(screen.getByRole('button', { name: 'Créer le voyage' }));
    expect(await screen.findByText('La création a échoué : rien n’a été enregistré.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ouvrir le voyage' })).toBeInTheDocument());
  });

  it('I5 : recoller une autre réponse ; I2 : message distinct si le nettoyage a échoué', async () => {
    const onRepaste = vi.fn();
    const { CreationError } = await import('../../ai/tripFromItinerary');
    render(<MemoryRouter><ControlPanel draft={draft()} today="2026-11-12" onRepaste={onRepaste} onCreate={async () => { throw new CreationError('voyage incomplet peut-être resté'); }} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Recoller une autre réponse' }));
    expect(onRepaste).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Créer le voyage' }));
    expect(await screen.findByText('voyage incomplet peut-être resté')).toBeInTheDocument();
  });
});
