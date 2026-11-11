import { formatDate, formatDayLabel, formatDistance, formatDuration } from './format';

describe('format', () => {
  it('formate une date', () => expect(formatDate('2026-12-03')).toBe('03/12/2026'));
  it('formate une durée en heures', () => expect(formatDuration(125)).toBe('2 h 05'));
  it('formate une durée en minutes', () => expect(formatDuration(45)).toBe('45 min'));
  it('formate une heure pile', () => expect(formatDuration(120)).toBe('2 h'));
  it('formate une distance', () => expect(formatDistance(12.345)).toBe('12,3 km'));
  it('formate un libellé de jour', () => expect(formatDayLabel('2026-12-03')).toBe('jeudi 3 décembre'));
});
