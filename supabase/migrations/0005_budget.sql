-- Étape 2 : budget (enveloppe, voyageurs, lignes prévues, dépenses réelles).
-- Le budget reste hors de trip_bundle_json : il ne doit jamais fuiter vers le partage ni le calendrier.

alter table public.trips
  add column budget_cap numeric check (budget_cap is null or budget_cap >= 0),
  add column budget_cap_mode text not null default 'total' check (budget_cap_mode in ('total', 'per_person')),
  add column fx_margin_pct numeric not null default 3 check (fx_margin_pct between 0 and 20);

create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  category text not null check (category in ('flight', 'lodging', 'local_transport', 'food', 'activity', 'shopping', 'contingency', 'other')),
  label text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  mode text not null default 'fixed' check (mode in ('fixed', 'per_person', 'per_day', 'per_person_per_day')),
  position integer not null default 0,
  rate_to_eur numeric not null default 1 check (rate_to_eur > 0),
  rate_manual boolean not null default false,
  rate_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  date date not null,
  category text not null check (category in ('flight', 'lodging', 'local_transport', 'food', 'activity', 'shopping', 'contingency', 'other')),
  label text not null default '',
  amount numeric not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  rate_to_eur numeric not null check (rate_to_eur > 0),
  rate_manual boolean not null default false,
  paid_by uuid not null references public.travelers (id) on delete cascade, -- protégé par prevent_used_traveler_delete
  line_id uuid references public.budget_lines (id) on delete set null,
  reservation_id uuid references public.reservations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (line_id is not null and reservation_id is not null))
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  traveler_id uuid not null references public.travelers (id) on delete cascade, -- protégé par prevent_used_traveler_delete
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (expense_id, traveler_id)
);

-- Un voyageur payeur ou concerné par une dépense ne peut pas être supprimé tant que son voyage existe.
-- (Quand le voyage lui-même est supprimé, il a déjà disparu au moment du déclenchement : tout part en cascade.)
create or replace function public.prevent_used_traveler_delete() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.trips where id = old.trip_id)
     and (exists (select 1 from public.expenses where paid_by = old.id)
          or exists (select 1 from public.expense_shares where traveler_id = old.id)) then
    raise exception 'TRAVELER_IN_USE' using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.prevent_used_traveler_delete() from public, anon, authenticated;
create trigger prevent_used_traveler_delete before delete on public.travelers for each row execute function public.prevent_used_traveler_delete();

create index on public.travelers (trip_id);
create index on public.budget_lines (trip_id);
create index on public.expenses (trip_id);
create index on public.expenses (paid_by);
create index on public.expense_shares (traveler_id);

do $$
declare tbl text;
begin
  foreach tbl in array array['travelers', 'budget_lines', 'expenses', 'expense_shares'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
  foreach tbl in array array['travelers', 'budget_lines', 'expenses'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl);
  end loop;
end $$;
-- Volontairement aucun déclencheur touch_trip : la date « mis à jour le » du partage ne doit pas trahir l'activité du budget.

create policy owner_all on public.travelers for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.budget_lines for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.expenses for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
    and exists (select 1 from public.travelers v where v.id = paid_by and v.user_id = auth.uid() and v.trip_id = expenses.trip_id)
    and (line_id is null or exists (select 1 from public.budget_lines l where l.id = line_id and l.user_id = auth.uid() and l.trip_id = expenses.trip_id))
    and (reservation_id is null or exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid() and r.trip_id = expenses.trip_id))
  );

create policy owner_all on public.expense_shares for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid())
    and exists (select 1 from public.travelers v where v.id = traveler_id and v.user_id = auth.uid())
  );

-- Le partage et le calendrier reprennent trip_bundle_json : on y retire les champs budget du voyage.
create or replace function public.trip_bundle_json(p_trip uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', (select to_jsonb(t) - 'budget_cap' - 'budget_cap_mode' - 'fx_margin_pct' from public.trips t where t.id = p_trip),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from public.days d where d.trip_id = p_trip), '[]'),
    'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.stops s join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'legs', coalesce((select jsonb_agg(to_jsonb(l)) from public.legs l join public.stops s on s.id = l.from_stop_id join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r)) from public.reservations r where r.trip_id = p_trip), '[]'),
    'checklist', coalesce((select jsonb_agg(to_jsonb(c) order by c.position) from public.checklist_items c where c.trip_id = p_trip), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(k)) from public.contacts k where k.trip_id = p_trip), '[]')
  );
$$;
revoke execute on function public.trip_bundle_json(uuid) from public, anon, authenticated;

-- Budget complet d'un voyage de l'utilisateur connecté, en un seul appel (les règles d'accès s'appliquent).
create or replace function public.get_my_budget(p_trip uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.trips where id = p_trip) then return null; end if;
  return jsonb_build_object(
    'travelers', coalesce((select jsonb_agg(to_jsonb(v) order by v.position) from public.travelers v where v.trip_id = p_trip), '[]'),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.budget_lines l where l.trip_id = p_trip), '[]'),
    'expenses', coalesce((
      select jsonb_agg(
        to_jsonb(e) || jsonb_build_object('participant_ids', coalesce((select jsonb_agg(s.traveler_id) from public.expense_shares s where s.expense_id = e.id), '[]'::jsonb))
        order by e.date, e.created_at)
      from public.expenses e where e.trip_id = p_trip), '[]')
  );
end $$;
revoke execute on function public.get_my_budget(uuid) from public, anon;
grant execute on function public.get_my_budget(uuid) to authenticated;

-- Enregistre une dépense et ses parts en une seule opération.
create or replace function public.save_expense(p_expense jsonb, p_participants uuid[]) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r public.expenses;
  v_id uuid := nullif(p_expense ->> 'id', '')::uuid;
begin
  if p_participants is null or cardinality(p_participants) = 0 then
    raise exception 'NO_PARTICIPANT' using errcode = '22023';
  end if;
  if nullif(p_expense ->> 'line_id', '') is not null and nullif(p_expense ->> 'reservation_id', '') is not null then
    raise exception 'BOTH_LINKS' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.expenses (trip_id, date, category, label, amount, currency, rate_to_eur, rate_manual, paid_by, line_id, reservation_id)
    values (
      (p_expense ->> 'trip_id')::uuid, (p_expense ->> 'date')::date, p_expense ->> 'category', coalesce(p_expense ->> 'label', ''),
      (p_expense ->> 'amount')::numeric, coalesce(p_expense ->> 'currency', 'EUR'), (p_expense ->> 'rate_to_eur')::numeric,
      coalesce((p_expense ->> 'rate_manual')::boolean, false), (p_expense ->> 'paid_by')::uuid,
      nullif(p_expense ->> 'line_id', '')::uuid, nullif(p_expense ->> 'reservation_id', '')::uuid)
    returning * into r;
  else
    update public.expenses set
      date = (p_expense ->> 'date')::date, category = p_expense ->> 'category', label = coalesce(p_expense ->> 'label', ''),
      amount = (p_expense ->> 'amount')::numeric, currency = coalesce(p_expense ->> 'currency', 'EUR'),
      rate_to_eur = (p_expense ->> 'rate_to_eur')::numeric, rate_manual = coalesce((p_expense ->> 'rate_manual')::boolean, false),
      paid_by = (p_expense ->> 'paid_by')::uuid, line_id = nullif(p_expense ->> 'line_id', '')::uuid,
      reservation_id = nullif(p_expense ->> 'reservation_id', '')::uuid
    where id = v_id
    returning * into r;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    delete from public.expense_shares where expense_id = v_id;
  end if;
  insert into public.expense_shares (expense_id, traveler_id) select r.id, t from unnest(p_participants) t;
  return to_jsonb(r) || jsonb_build_object('participant_ids', to_jsonb(p_participants));
end $$;
revoke execute on function public.save_expense(jsonb, uuid[]) from public, anon;
grant execute on function public.save_expense(jsonb, uuid[]) to authenticated;
