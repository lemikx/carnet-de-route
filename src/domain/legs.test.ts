import { canAutoCompute, orderedStops, planLegs } from './legs';
import { coordKey } from './time';
import { makeDay, makeLeg, makeStop } from '../test/factories';

const d1 = makeDay({ id: 'd1', date: '2026-12-01' });
const d2 = makeDay({ id: 'd2', date: '2026-12-02' });

const pairs = (p: { fromStopId: string; toStopId: string }[]) => p.map((x) => `${x.fromStopId}>${x.toStopId}`);

describe('planLegs', () => {
  it('crée un trajet entre chaque paire de lieux consécutifs', () => {
    const a = makeStop({ id: 'A', dayId: 'd1', position: 0 });
    const b = makeStop({ id: 'B', dayId: 'd1', position: 1 });
    const c = makeStop({ id: 'C', dayId: 'd1', position: 2 });
    const plan = planLegs(orderedStops([d1], [c, a, b]), []);
    expect(pairs(plan.create)).toEqual(['A>B', 'B>C']);
    expect(plan.create[0].mode).toBe('car');
  });

  it('relie le dernier lieu d’un jour au premier du jour suivant', () => {
    const a = makeStop({ id: 'A', dayId: 'd1', position: 0 });
    const b = makeStop({ id: 'B', dayId: 'd1', position: 1 });
    const c = makeStop({ id: 'C', dayId: 'd2', position: 0 });
    expect(pairs(planLegs(orderedStops([d2, d1], [c, b, a]), []).create)).toContain('B>C');
  });

  it('supprime et recrée les trajets quand un lieu change de place', () => {
    const a = makeStop({ id: 'A', position: 0 });
    const c = makeStop({ id: 'C', position: 1 });
    const b = makeStop({ id: 'B', position: 2 });
    const legs = [makeLeg(a, b), makeLeg(b, c)];
    const plan = planLegs(orderedStops([d1], [a, b, c]), legs);
    expect(pairs(plan.remove)).toEqual(['A>B', 'B>C']);
    expect(pairs(plan.create)).toEqual(['A>C', 'C>B']);
  });

  it('recalcule un trajet auto quand une adresse change, pas un trajet manuel', () => {
    const a = makeStop({ id: 'A', position: 0, lat: 35, lon: 135 });
    const b = makeStop({ id: 'B', position: 1, lat: 34.9, lon: 135.7 });
    const old = { fromKey: coordKey(35, 135), toKey: coordKey(34, 135), durationMin: 30 };
    const auto = makeLeg(a, b, old);
    expect(planLegs(orderedStops([d1], [a, b]), [auto]).recompute).toEqual([auto]);
    const manual = makeLeg(a, b, { ...old, source: 'manual' });
    expect(planLegs(orderedStops([d1], [a, b]), [manual]).recompute).toEqual([]);
  });

  it('recalcule un trajet auto sans durée', () => {
    const a = makeStop({ id: 'A', position: 0 });
    const b = makeStop({ id: 'B', position: 1 });
    const leg = makeLeg(a, b, { fromKey: coordKey(a.lat, a.lon), toKey: coordKey(b.lat, b.lon) });
    expect(planLegs(orderedStops([d1], [a, b]), [leg]).recompute).toEqual([leg]);
  });

  it('ne recalcule pas en boucle un trajet en erreur si les adresses n’ont pas changé', () => {
    const a = makeStop({ id: 'A', position: 0 });
    const b = makeStop({ id: 'B', position: 1 });
    const keys = { fromKey: coordKey(a.lat, a.lon), toKey: coordKey(b.lat, b.lon) };
    const failed = makeLeg(a, b, { ...keys, error: 'Aucun trajet routier possible' });
    expect(planLegs(orderedStops([d1], [a, b]), [failed]).recompute).toEqual([]);
  });

  it('ne calcule pas un trajet vers un lieu sans coordonnées', () => {
    const a = makeStop({ id: 'A', position: 0 });
    const b = makeStop({ id: 'B', position: 1, lat: null, lon: null });
    const leg = makeLeg(a, b);
    expect(canAutoCompute(leg, a, b)).toBe(false);
    expect(planLegs(orderedStops([d1], [a, b]), [leg]).recompute).toEqual([]);
  });

  it('ne calcule pas un trajet en avion', () => {
    const a = makeStop({ id: 'A' });
    const b = makeStop({ id: 'B', position: 1 });
    expect(canAutoCompute(makeLeg(a, b, { mode: 'plane' }), a, b)).toBe(false);
  });
});
