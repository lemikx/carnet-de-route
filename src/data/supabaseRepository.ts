import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItem, Contact, Day, Leg, Reservation, ShareLink, Stop, Trip, TripBundle } from '../domain/types';
import { fromRow, rowsToBundle, toRow } from './supabaseMapping';
import { NotFoundError, type CalendarLink, type TripRepository } from './TripRepository';

type Row = Record<string, unknown>;
const notYet = (): never => {
  throw new Error('Budget Supabase : pas encore implémenté');
};

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseRepository(client: SupabaseClient): TripRepository {
  async function save<T>(table: string, obj: object): Promise<T> {
    const row = toRow(obj);
    const q = 'id' in row && row.id ? client.from(table).upsert(row) : client.from(table).insert(row);
    return fromRow<T>(check(await q.select().single()) as Row);
  }
  async function remove(table: string, ids: string[]) {
    if (ids.length) check(await client.from(table).delete().in('id', ids));
  }
  const shareLink = (r: Row): ShareLink => fromRow<ShareLink>(r);
  const calendarLink = (r: Row): CalendarLink => fromRow<CalendarLink>(r);

  return {
    async listTrips() {
      return (check(await client.from('trips').select('*').order('start_date')) as Row[]).map((r) => fromRow<Trip>(r));
    },
    async getBundle(tripId) {
      // Un seul appel, quelle que soit la taille du voyage (pas de liste d'identifiants dans l'URL).
      const json = check(await client.rpc('get_my_trip_bundle', { p_trip: tripId })) as Row | null;
      if (!json || !json.trip) throw new NotFoundError('Voyage introuvable');
      return rowsToBundle(json) as TripBundle;
    },
    createTrip: (t) => save<Trip>('trips', t),
    updateTrip: (t) => save<Trip>('trips', t),
    async deleteTrip(id) {
      await remove('trips', [id]);
    },
    async createDays(tripId, dates) {
      if (!dates.length) return [];
      const rows = check(await client.from('days').insert(dates.map((date) => ({ trip_id: tripId, date }))).select()) as Row[];
      return rows.map((r) => fromRow<Day>(r));
    },
    deleteDays: (ids) => remove('days', ids),
    updateDay: (d) => save<Day>('days', d),
    saveStop: (s) => save<Stop>('stops', s),
    deleteStop: (id) => remove('stops', [id]),
    async reorderStops(dayId, orderedIds) {
      for (const [position, id] of orderedIds.entries()) {
        check(await client.from('stops').update({ day_id: dayId, position }).eq('id', id));
      }
    },
    saveLeg: (l) => save<Leg>('legs', l),
    deleteLegs: (ids) => remove('legs', ids),
    saveReservation: (r) => save<Reservation>('reservations', r),
    deleteReservation: (id) => remove('reservations', [id]),
    saveChecklistItem: (i) => save<ChecklistItem>('checklist_items', i),
    deleteChecklistItem: (id) => remove('checklist_items', [id]),
    saveContact: (c) => save<Contact>('contacts', c),
    deleteContact: (id) => remove('contacts', [id]),
    async getShareLink(tripId) {
      const r = check(await client.from('share_links').select('*').eq('trip_id', tripId).eq('active', true).maybeSingle()) as Row | null;
      return r ? shareLink(r) : null;
    },
    async createShareLink(tripId, hideSensitive) {
      const rows = check(await client.rpc('create_share_link', { p_trip: tripId, p_hide: hideSensitive })) as Row[];
      return shareLink(rows[0]);
    },
    async revokeShareLink(tripId) {
      check(await client.from('share_links').update({ active: false, revoked_at: new Date().toISOString() }).eq('trip_id', tripId).eq('active', true));
    },
    async getSharedRoadbook(token) {
      const json = check(await client.rpc('get_shared_roadbook', { p_token: token })) as Row | null;
      if (!json) return null;
      return {
        bundle: rowsToBundle(json),
        hideSensitive: Boolean(json.hide_sensitive),
        ownerName: String(json.owner_name ?? ''),
        updatedAt: String(json.updated_at ?? ''),
      };
    },
    async getCalendarLink(tripId) {
      const r = check(await client.from('calendar_links').select('*').eq('trip_id', tripId).eq('active', true).maybeSingle()) as Row | null;
      return r ? calendarLink(r) : null;
    },
    async createCalendarLink(tripId, o) {
      const rows = check(
        await client.rpc('create_calendar_link', { p_trip: tripId, p_legs: o.includeLegs, p_checklist: o.includeChecklist }),
      ) as Row[];
      return calendarLink(rows[0]);
    },
    async updateCalendarOptions(tripId, o) {
      const r = check(
        await client.from('calendar_links').update({ include_legs: o.includeLegs, include_checklist: o.includeChecklist })
          .eq('trip_id', tripId).eq('active', true).select().single(),
      ) as Row;
      return calendarLink(r);
    },
    async revokeCalendarLink(tripId) {
      check(await client.from('calendar_links').update({ active: false, revoked_at: new Date().toISOString() }).eq('trip_id', tripId).eq('active', true));
    },
    // Budget : implémentation Supabase à la tâche 6.
    getBudget: notYet, saveTraveler: notYet, deleteTraveler: notYet, saveBudgetLine: notYet,
    deleteBudgetLine: notYet, saveExpense: notYet, deleteExpense: notYet, updateBudgetSettings: notYet,
    async getDisplayName() {
      const r = check(await client.from('profiles').select('display_name').maybeSingle()) as Row | null;
      return String(r?.display_name ?? '');
    },
    async setDisplayName(name) {
      check(await client.from('profiles').upsert({ display_name: name.trim().slice(0, 60) }));
    },
  };
}
