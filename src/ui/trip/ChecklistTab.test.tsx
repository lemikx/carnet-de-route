import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { ChecklistTab } from './ChecklistTab';
import { makeTrip } from '../../test/factories';
import type { ChecklistItem, TripBundle } from '../../domain/types';

const item = (id: string, over: Partial<ChecklistItem>): ChecklistItem => ({
  id, tripId: 't1', category: 'documents', label: id, done: false, dueDate: null, position: 0, ...over,
});

describe('ChecklistTab', () => {
  it('affiche la progression et les échéances dépassées', () => {
    const bundle: TripBundle = {
      trip: makeTrip({ id: 't1' }), days: [], stops: [], legs: [], reservations: [], contacts: [],
      checklist: [item('Passeport', { done: true }), item('Assurance', { done: true }), item('Visa', { dueDate: '2020-01-01' })],
    };
    render(
      <MemoryRouter>
        <TestAppProvider repo={createMemoryRepository()}>
          <ChecklistTab bundle={bundle} setBundle={() => {}} reload={async () => {}} />
        </TestAppProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('2/3 faits')).toBeInTheDocument();
    expect(screen.getByText('Visa').closest('li')).toHaveClass('overdue-item');
    expect(screen.getByText(/avant le 01\/01\/2020/)).toHaveClass('overdue');
  });
});
