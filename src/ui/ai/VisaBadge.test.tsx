import { render, screen } from '@testing-library/react';
import type { VisaInfo } from '../../ai/types';
import { VisaBadge } from './VisaBadge';

const v = (o: Partial<VisaInfo>): VisaInfo => ({ required: true, type: '', processingDaysMin: 1, processingDaysMax: 20, officialUrl: 'https://visa.example.org', notes: '', ...o });
const show = (visa: VisaInfo) => render(<VisaBadge visa={visa} departureDate="2026-12-20" today="2026-11-12" />);

describe('VisaBadge', () => {
  it.each([
    [{ processingDaysMax: 20 }, 'Visa : pas de souci de délai'],
    [{ processingDaysMax: 30 }, 'Visa : délai serré'],
    [{ processingDaysMax: 45 }, 'Visa : délai insuffisant'],
    [{ required: 'unknown' as const }, 'Visa : à vérifier'],
  ])('affiche le niveau %j', (o, label) => {
    show(v(o));
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('Information donnée par l’IA : à vérifier sur le site officiel')).toBeInTheDocument();
  });
  it('lien officiel https seulement', () => {
    const { unmount } = show(v({}));
    expect(screen.getByRole('link', { name: 'Site officiel' })).toHaveAttribute('href', 'https://visa.example.org');
    unmount();
    show(v({ officialUrl: 'javascript:alert(1)' }));
    expect(screen.queryByRole('link')).toBeNull();
  });
});
