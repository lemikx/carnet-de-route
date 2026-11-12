import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AiDraft } from '../../ai/types';
import { DraftsList } from './DraftsList';

const d = (id: string, stage: AiDraft['stage'], destination: string | null): AiDraft => ({
  id, stage, mode: destination ? 'known' : 'surprise', ideas: null, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
  brief: {
    destination, startDate: '2026-12-20', endDate: '2026-12-24', departureCity: null, adults: 1, children: 0, travelers: [], budgetPerPersonEur: null,
    travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
  },
});
const show = (drafts: AiDraft[], onDelete = vi.fn()) => render(<MemoryRouter><DraftsList drafts={drafts} onDelete={onDelete} /></MemoryRouter>);

describe('DraftsList', () => {
  it('affiche les brouillons, masque les voyages créés', () => {
    show([d('1', 'ideas_received', null), d('2', 'brief', 'Kyoto'), d('3', 'created', 'Rome')]);
    expect(screen.getByText('Surprends-moi')).toBeInTheDocument();
    expect(screen.getByText('Idées reçues : à choisir')).toBeInTheDocument();
    expect(screen.getByText('Kyoto')).toBeInTheDocument();
    expect(screen.queryByText('Rome')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Reprendre' })[0]).toHaveAttribute('href', '/ia/1');
  });
  it('liste vide : rien', () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });
  it('supprime après confirmation', async () => {
    const onDelete = vi.fn();
    show([d('1', 'brief', 'Kyoto')], onDelete);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' }).pop()!);
    expect(onDelete).toHaveBeenCalledWith('1');
  });
});
