import { render, screen } from '@testing-library/react';
import type { BestPeriod } from '../../ai/types';
import { PeriodBadge } from './PeriodBadge';

const KH: BestPeriod = { text: 'Novembre à février : peu de pluie.', goodMonths: [11, 12, 1, 2], avoidMonths: [3, 4] };
const show = (p: BestPeriod | null, s = '2026-12-20', e = '2026-12-24') => render(<PeriodBadge period={p} startDate={s} endDate={e} />);

describe('PeriodBadge', () => {
  it('rien sans période', () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([
    ['2026-12-20', '2026-12-24', 'period-good', 'Tes dates tombent en bonne période.'],
    ['2026-10-10', '2026-10-12', 'period-average', 'Période intermédiaire pour tes dates.'],
    ['2027-03-10', '2027-03-12', 'period-avoid', 'Tes dates tombent dans une période à éviter.'],
  ])('%s → %s : %s', (s, e, cls, label) => {
    const { container } = show(KH, s, e);
    expect(container.querySelector(`.${cls}`)).not.toBeNull();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('Novembre à février : peu de pluie.')).toBeInTheDocument();
    expect(screen.getByText('Information donnée par l’IA : à vérifier')).toBeInTheDocument();
  });
  it('texte piégé affiché comme texte', () => {
    const { container } = show({ ...KH, text: '<img src=x onerror=alert(1)>' });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});
