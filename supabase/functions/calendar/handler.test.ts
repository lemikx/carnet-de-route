import { handleCalendar } from './handler';
import { buildCalendar } from '../../../src/domain/calendar';
import { sampleBundle } from '../../../src/test/bundle';

const opts = { includeLegs: true, includeChecklist: true };
const req = (url: string, method = 'GET') => new Request(url, { method });

describe('handleCalendar', () => {
  it('renvoie le calendrier pour un jeton valide', async () => {
    const res = await handleCalendar(req('https://x/functions/v1/calendar?token=' + 'a'.repeat(32)), async (t) => (t === 'a'.repeat(32) ? { bundle: sampleBundle(), opts } : null), buildCalendar);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=900');
    expect(await res.text()).toContain('BEGIN:VEVENT');
  });
  it('renvoie 404 sans rien révéler pour un jeton inconnu', async () => {
    const res = await handleCalendar(req('https://x/calendar?token=zzz'), async () => null, buildCalendar);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });
  it('renvoie 404 sans jeton', async () => {
    expect((await handleCalendar(req('https://x/calendar'), async () => null, buildCalendar)).status).toBe(404);
  });
  it('refuse les autres méthodes', async () => {
    expect((await handleCalendar(req('https://x/calendar?token=abc', 'POST'), async () => null, buildCalendar)).status).toBe(405);
  });
});
