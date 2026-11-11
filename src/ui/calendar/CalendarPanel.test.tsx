import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { sampleBundle } from '../../test/bundle';
import { CalendarPanel } from './CalendarPanel';
import { calendarFeedUrl, icsFilename } from './download';
import * as download from './download';

describe('CalendarPanel', () => {
  it('propose le téléchargement avec les options cochées par défaut', async () => {
    const spy = vi.spyOn(download, 'downloadIcs').mockImplementation(() => {});
    render(<TestAppProvider repo={createMemoryRepository()}><CalendarPanel bundle={sampleBundle()} /></TestAppProvider>);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Calendrier' }));
    expect(screen.getByLabelText('Inclure les trajets de plus de 30 min')).toBeChecked();
    expect(screen.getByLabelText('Inclure les échéances de la checklist')).toBeChecked();
    await u.click(screen.getByRole('button', { name: 'Télécharger (.ics)' }));
    expect(spy).toHaveBeenCalledWith('Japon.ics', expect.stringMatching(/^BEGIN:VCALENDAR/));
  });

  it('avertit et demande confirmation pour un abonnement actif', async () => {
    const repo = createMemoryRepository();
    const b = sampleBundle();
    const trip = await repo.createTrip(b.trip);
    await repo.createCalendarLink(trip.id, { includeLegs: true, includeChecklist: true });
    render(<TestAppProvider repo={repo}><CalendarPanel bundle={{ ...b, trip }} /></TestAppProvider>);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Calendrier' }));
    expect(await screen.findByText('Cette adresse contient tes numéros de réservation. Ne la partage pas : pour ta famille, utilise le partage du roadbook.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Désactiver' }));
    expect(screen.getAllByRole('dialog').at(-1)).toHaveTextContent('Désactiver l’abonnement ?');
  });
});

describe('adresses calendrier', () => {
  it('construit l’adresse webcal', () => {
    expect(calendarFeedUrl('https://abc.supabase.co', 'f00')).toBe('webcal://abc.supabase.co/functions/v1/calendar?token=f00');
  });
  it('nettoie le nom de fichier', () => expect(icsFilename('Japon / Corée : 2026')).toBe('Japon - Corée - 2026.ics'));
  it('remplace les symboles du nom de fichier', () => expect(icsFilename('Paris → Japon ✈️')).toBe('Paris - Japon.ics'));
});
