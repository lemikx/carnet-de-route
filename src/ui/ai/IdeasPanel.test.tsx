import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDEAS_FIXTURE } from '../../ai/fixtures';
import type { AiDraft } from '../../ai/types';
import { IdeasPanel } from './IdeasPanel';

const draft = (ideas = IDEAS_FIXTURE.ideas): AiDraft => ({
  id: 'd1', stage: 'ideas_received', mode: 'surprise', ideas, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
  brief: {
    destination: null, startDate: '2026-12-20', endDate: '2026-12-24', departureCity: null, adults: 1, children: 0, travelers: [], budgetPerPersonEur: null,
    travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
  },
});

describe('IdeasPanel', () => {
  it('range vert, orange, gris puis rouge, même si la réponse a un autre ordre', () => {
    const [kyoto, hanoi, lagos] = IDEAS_FIXTURE.ideas;
    render(<IdeasPanel draft={draft([lagos, hanoi, kyoto])} today="2026-11-12" onChoose={() => {}} />);
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(heads.slice(0, 2).join()).toMatch(/Kyoto.*Hanoï|Hanoï.*Kyoto/);
    expect(heads[2]).toContain('Lagos');
    const last = screen.getAllByRole('listitem').filter((li) => li.classList.contains('idea-card')).pop()!;
    expect(last).toHaveClass('muted');
    expect(within(last).getByText(/Délai de traitement jusqu'à 4000 jours/)).toBeInTheDocument();
  });
  it('« Choisir cette idée » renvoie le bon id', async () => {
    const onChoose = vi.fn();
    render(<IdeasPanel draft={draft()} today="2026-11-12" onChoose={onChoose} />);
    const card = screen.getByRole('heading', { name: /Hanoï/ }).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Choisir cette idée' }));
    expect(onChoose).toHaveBeenCalledWith('hanoi');
  });
  it('texte piégé affiché comme texte', () => {
    const ideas = structuredClone(IDEAS_FIXTURE.ideas);
    ideas[0].summary = '<img src=x onerror=alert(1)>';
    const { container } = render(<IdeasPanel draft={draft(ideas)} today="2026-11-12" onChoose={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});
