import { render, screen, within } from '@testing-library/react';
import type { Reservation } from '../../domain/types';
import { ReservationCard } from './ReservationCard';

const base: Reservation = {
  id: 'r1', tripId: 't', type: 'flight', title: 'AF276',
  startAt: { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' },
  endAt: { date: '2026-12-02', time: '06:00', timezone: 'Asia/Tokyo' },
  fromPlace: { title: 'Paris', address: '', lat: null, lon: null, timezone: 'Europe/Paris' },
  toPlace: { title: 'Tokyo', address: '', lat: null, lon: null, timezone: 'Asia/Tokyo' },
  confirmationNumber: 'XK7Q2P', price: null, currency: '', url: '', phone: '', note: '',
};
const noop = () => {};
const show = (r: Reservation) =>
  render(<ul><ReservationCard r={r} inTrip disabled={false} onEdit={noop} onDelete={noop} /></ul>);

describe('ReservationCard — billet de vol', () => {
  it('affiche lieux, dates, durée et champs existants', () => {
    show(base);
    const card = screen.getByTestId('reservation');
    expect(card).toHaveTextContent('Billet');
    expect(card).toHaveTextContent('Paris');
    expect(card).toHaveTextContent('Tokyo');
    expect(card).toHaveTextContent('12 h');
    expect(card).toHaveTextContent('XK7Q2P');
    expect(within(card).getByRole('button', { name: 'Copier le n°' })).toBeVisible();
  });

  it('n’invente aucun champ absent (siège, porte, code, statut)', () => {
    show({ ...base, confirmationNumber: '' });
    const card = screen.getByTestId('reservation');
    expect(card).not.toHaveTextContent(/siège|porte|seat|gate|statut/i);
    expect(card).not.toHaveTextContent('N° de confirmation');
    expect(within(card).queryByRole('button', { name: 'Copier le n°' })).toBeNull();
  });

  it('affiche les codes d’aéroport en grand avec la ville dessous, puis terminal, porte et siège', () => {
    show({ ...base, departureCode: 'CDG', arrivalCode: 'HND', terminal: '2E', gate: 'K41', seat: '14A' });
    const card = screen.getByTestId('reservation');
    expect(within(card).getByText('CDG')).toHaveClass('bp-place');
    expect(within(card).getByText('HND')).toHaveClass('bp-place');
    expect(within(card).getByText('Paris')).toHaveClass('bp-city');
    expect(within(card).getByText('Tokyo')).toHaveClass('bp-city');
    expect(card).toHaveTextContent('Terminal');
    expect(card).toHaveTextContent('2E');
    expect(card).toHaveTextContent('Porte');
    expect(card).toHaveTextContent('K41');
    expect(card).toHaveTextContent('Siège');
    expect(card).toHaveTextContent('14A');
  });

  it('masque les champs non renseignés et garde le nom du lieu sans code', () => {
    show({ ...base, departureCode: null, arrivalCode: 'HND', terminal: '', gate: null, seat: '14A' });
    const card = screen.getByTestId('reservation');
    expect(within(card).getByText('Paris')).toHaveClass('bp-place');
    expect(card).not.toHaveTextContent('Terminal');
    expect(card).not.toHaveTextContent('Porte');
    expect(card).toHaveTextContent('Siège');
  });

  it('sans arrivée : pas de durée ni de lieu d’arrivée', () => {
    show({ ...base, endAt: null, toPlace: null });
    expect(screen.getByTestId('reservation')).not.toHaveTextContent(' h');
    expect(screen.queryByText('Tokyo')).toBeNull();
  });

  it('les autres réservations gardent une carte simple', () => {
    show({ ...base, type: 'lodging', title: 'Hôtel Sakura' });
    const card = screen.getByTestId('reservation');
    expect(card).toHaveTextContent('Hôtel Sakura');
    expect(card).not.toHaveTextContent('Billet');
  });
});
