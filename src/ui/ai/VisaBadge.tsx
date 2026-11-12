import { assessVisa, type VisaLevel } from '../../ai/visa';
import type { VisaInfo } from '../../ai/types';
import { safeHref } from '../common/safeHref';

export const VISA_LABELS: Record<VisaLevel, string> = {
  green: 'Visa : pas de souci de délai',
  orange: 'Visa : délai serré',
  red: 'Visa : délai insuffisant',
  grey: 'Visa : à vérifier',
};

export function VisaBadge({ visa, departureDate, today }: { visa: VisaInfo; departureDate: string; today: string }) {
  const a = assessVisa(visa, { departureDate, today });
  const href = visa.officialUrl ? safeHref(visa.officialUrl) : null;
  return (
    <div className={`visa-badge visa-${a.level}`}>
      <strong>{VISA_LABELS[a.level]}</strong>
      <span>{a.reason}</span>
      {visa.notes && <span className="muted">{visa.notes}</span>}
      {href && <a href={href} target="_blank" rel="noreferrer noopener">Site officiel</a>}
      <small className="muted">Information donnée par l’IA : à vérifier sur le site officiel</small>
    </div>
  );
}
