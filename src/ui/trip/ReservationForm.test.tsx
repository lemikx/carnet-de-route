import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationForm } from './ReservationForm';
import { createFakeRouting } from '../../routing/fakeRouting';

describe('ReservationForm', () => {
  it('refuse une arrivée avant le départ', async () => {
    const onSave = vi.fn();
    render(<ReservationForm routing={createFakeRouting()} tripId="t1" defaultTimezone="Europe/Paris" onSave={onSave} onCancel={() => {}} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText('Type'), 'train');
    await u.type(screen.getByLabelText('Titre'), 'TGV');
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-02');
    await u.type(screen.getByLabelText('Heure de départ'), '10:00');
    await u.type(screen.getByLabelText('Date d’arrivée'), '2026-12-01');
    await u.type(screen.getByLabelText('Heure d’arrivée'), '12:00');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('L’arrivée doit être après le départ')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('enregistre une réservation valide', async () => {
    const onSave = vi.fn();
    render(<ReservationForm routing={createFakeRouting()} tripId="t1" defaultTimezone="Europe/Paris" onSave={onSave} onCancel={() => {}} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Titre'), 'Musée');
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-02');
    await u.type(screen.getByLabelText('Heure de départ'), '10:00');
    await u.type(screen.getByLabelText('N° de confirmation'), 'XY12');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 't1', type: 'activity', title: 'Musée', confirmationNumber: 'XY12',
      startAt: { date: '2026-12-02', time: '10:00', timezone: 'Europe/Paris' }, endAt: null,
    }));
  });

  it('champs du billet : seulement pour un vol, codes en majuscules', async () => {
    const onSave = vi.fn();
    render(<ReservationForm routing={createFakeRouting()} tripId="t1" defaultTimezone="Europe/Paris" onSave={onSave} onCancel={() => {}} />);
    const u = userEvent.setup();
    expect(screen.queryByLabelText('Code aéroport de départ')).toBeNull();
    expect(screen.queryByLabelText('Siège')).toBeNull();
    await u.selectOptions(screen.getByLabelText('Type'), 'flight');
    await u.type(screen.getByLabelText('Titre'), 'AF276');
    await u.type(screen.getByLabelText('Code aéroport de départ'), 'cdg');
    await u.type(screen.getByLabelText('Code aéroport d’arrivée'), 'l1s2bcde');
    await u.type(screen.getByLabelText('Terminal'), '2E');
    await u.type(screen.getByLabelText('Porte'), 'K41');
    await u.type(screen.getByLabelText('Siège'), '14A');
    expect(screen.getByLabelText('Code aéroport de départ')).toHaveValue('CDG');
    expect(screen.getByLabelText('Code aéroport d’arrivée')).toHaveValue('LSBC');
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-01');
    await u.type(screen.getByLabelText('Heure de départ'), '10:00');
    await u.type(screen.getByLabelText('Date d’arrivée'), '2026-12-02');
    await u.type(screen.getByLabelText('Heure d’arrivée'), '06:00');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'flight', departureCode: 'CDG', arrivalCode: 'LSBC', terminal: '2E', gate: 'K41', seat: '14A',
    }));
  });

  it('un vol sans code ni siège s’enregistre quand même', async () => {
    const onSave = vi.fn();
    render(<ReservationForm routing={createFakeRouting()} tripId="t1" defaultTimezone="Europe/Paris" onSave={onSave} onCancel={() => {}} />);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText('Type'), 'flight');
    await u.type(screen.getByLabelText('Titre'), 'AF276');
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-01');
    await u.type(screen.getByLabelText('Heure de départ'), '10:00');
    await u.type(screen.getByLabelText('Date d’arrivée'), '2026-12-02');
    await u.type(screen.getByLabelText('Heure d’arrivée'), '06:00');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ departureCode: null, arrivalCode: null, seat: null, gate: null, terminal: null }));
  });
});
