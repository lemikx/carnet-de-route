-- Carnet de route : création complète de la base (à coller dans Supabase > SQL Editor, puis Run).
-- Ne le lance qu'UNE seule fois sur un projet vide. Pour ajouter le budget à une base existante : voir docs/MISE-EN-PLACE.md.

-- ===== supabase/migrations/0001_schema.sql =====
-- Carnet de route — schéma principal.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  countries text[] not null default '{}',
  start_date date not null,
  end_date date not null,
  local_currency text not null default '',
  home_timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  date date not null,
  title text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, date)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  type text not null check (type in ('flight', 'lodging', 'car_rental', 'train', 'activity', 'other')),
  title text not null default '',
  start_at jsonb not null,
  end_at jsonb,
  from_place jsonb,
  to_place jsonb,
  confirmation_number text not null default '',
  price numeric,
  currency text not null default '',
  url text not null default '',
  phone text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day_id uuid not null references public.days (id) on delete cascade,
  position integer not null default 0,
  kind text not null default 'activity' check (kind in ('activity', 'lodging', 'point')),
  title text not null default '',
  address text not null default '',
  lat double precision,
  lon double precision,
  timezone text not null default 'Europe/Paris',
  start_time text check (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration_min integer,
  note text not null default '',
  phone text not null default '',
  url text not null default '',
  reservation_id uuid references public.reservations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.legs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_stop_id uuid not null references public.stops (id) on delete cascade,
  to_stop_id uuid not null references public.stops (id) on delete cascade,
  mode text not null default 'car' check (mode in ('car', 'walk', 'bike', 'train', 'bus', 'plane', 'ferry', 'other')),
  duration_min integer,
  distance_km numeric,
  geometry jsonb,
  source text not null default 'auto' check (source in ('auto', 'manual', 'reservation')),
  error text,
  computed_at timestamptz,
  from_key text,
  to_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  category text not null check (category in ('documents', 'health', 'luggage', 'before_departure')),
  label text not null default '',
  done boolean not null default false,
  due_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null default '',
  kind text not null default 'other' check (kind in ('embassy', 'emergency', 'lodging', 'other')),
  phone text not null default '',
  address text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.days (trip_id);
create index on public.stops (day_id);
create index on public.stops (reservation_id);
create index on public.legs (from_stop_id);
create index on public.legs (to_stop_id);
create index on public.reservations (trip_id);
create index on public.checklist_items (trip_id);
create index on public.contacts (trip_id);

-- Date de mise à jour (affichée sur le roadbook partagé).
create or replace function public.touch_trip(p_trip uuid) returns void language sql security definer set search_path = public as $$
  update public.trips set updated_at = now() where id = p_trip;
$$;
revoke execute on function public.touch_trip(uuid) from public;

create or replace function public.touch_trip_from_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
  t uuid;
begin
  if tg_table_name in ('days', 'reservations', 'checklist_items', 'contacts') then
    t := r.trip_id;
  elsif tg_table_name = 'stops' then
    select trip_id into t from public.days where id = r.day_id;
  elsif tg_table_name = 'legs' then
    select d.trip_id into t from public.stops s join public.days d on d.id = s.day_id where s.id = r.from_stop_id;
  end if;
  if t is not null then perform public.touch_trip(t); end if;
  return null;
end $$;

do $$
declare tbl text;
begin
  foreach tbl in array array['trips', 'days', 'reservations', 'stops', 'legs', 'checklist_items', 'contacts'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl);
    execute format('alter table public.%I enable row level security', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('revoke all on public.%I from anon', tbl);
  end loop;
  foreach tbl in array array['days', 'reservations', 'stops', 'legs', 'checklist_items', 'contacts'] loop
    execute format('create trigger touch_trip after insert or update or delete on public.%I for each row execute function public.touch_trip_from_row()', tbl);
  end loop;
end $$;

-- Règles d'accès : chacun ne voit et ne modifie que ses propres lignes,
-- et ne peut rattacher une ligne qu'à un parent qui lui appartient.
create policy owner_all on public.trips for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy owner_all on public.days for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.reservations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.checklist_items for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.contacts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy owner_all on public.stops for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.days d where d.id = day_id and d.user_id = auth.uid())
    and (reservation_id is null or exists (select 1 from public.reservations r where r.id = reservation_id and r.user_id = auth.uid()))
  );

create policy owner_all on public.legs for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.stops s where s.id = from_stop_id and s.user_id = auth.uid())
    and exists (select 1 from public.stops s where s.id = to_stop_id and s.user_id = auth.uid())
  );

-- ===== supabase/migrations/0002_sharing.sql =====
-- Partage du roadbook par lien secret en lecture seule.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  hide_sensitive boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index share_links_one_active on public.share_links (trip_id) where active;
alter table public.share_links enable row level security;
grant select, insert, update, delete on public.share_links to authenticated;
revoke all on public.share_links from anon;
create policy owner_all on public.share_links for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- Crée un nouveau lien (et désactive l'ancien). S'exécute avec les droits de l'appelant : les règles d'accès s'appliquent.
create or replace function public.create_share_link(p_trip uuid, p_hide boolean)
returns setof public.share_links language plpgsql security invoker set search_path = public as $$
begin
  update public.share_links set active = false, revoked_at = now() where trip_id = p_trip and active;
  return query insert into public.share_links (trip_id, hide_sensitive) values (p_trip, p_hide) returning *;
end $$;
revoke execute on function public.create_share_link(uuid, boolean) from public, anon;
grant execute on function public.create_share_link(uuid, boolean) to authenticated;

-- Contenu d'un voyage (sans aucune donnée d'un autre voyage).
create or replace function public.trip_bundle_json(p_trip uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', (select to_jsonb(t) from public.trips t where t.id = p_trip),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from public.days d where d.trip_id = p_trip), '[]'),
    'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.stops s join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'legs', coalesce((select jsonb_agg(to_jsonb(l)) from public.legs l join public.stops s on s.id = l.from_stop_id join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r)) from public.reservations r where r.trip_id = p_trip), '[]'),
    'checklist', coalesce((select jsonb_agg(to_jsonb(c) order by c.position) from public.checklist_items c where c.trip_id = p_trip), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(k)) from public.contacts k where k.trip_id = p_trip), '[]')
  );
$$;
revoke execute on function public.trip_bundle_json(uuid) from public, anon, authenticated;

-- Retire les champs sensibles d'un bundle (côté serveur).
create or replace function public.strip_sensitive(b jsonb) returns jsonb language sql immutable as $$
  select b
    || jsonb_build_object('days', coalesce((select jsonb_agg(d || '{"note":""}') from jsonb_array_elements(b -> 'days') d), '[]'))
    || jsonb_build_object('stops', coalesce((select jsonb_agg(
         s || jsonb_build_object('note', '', 'url', case when s ->> 'reservation_id' is null then s ->> 'url' else '' end)
       ) from jsonb_array_elements(b -> 'stops') s), '[]'))
    || jsonb_build_object('reservations', coalesce((select jsonb_agg(
         r || '{"confirmation_number":"","price":null,"currency":"","url":"","note":""}'
       ) from jsonb_array_elements(b -> 'reservations') r), '[]'))
    || jsonb_build_object('contacts', coalesce((select jsonb_agg(k || '{"note":""}') from jsonb_array_elements(b -> 'contacts') k), '[]'));
$$;

-- Lecture publique d'un roadbook partagé : seule porte d'entrée pour les visiteurs sans compte.
create or replace function public.get_shared_roadbook(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.share_links;
  b jsonb;
begin
  select * into l from public.share_links where token = p_token and active;
  if not found then return null; end if;
  b := public.trip_bundle_json(l.trip_id);
  if b -> 'trip' is null or b -> 'trip' = 'null'::jsonb then return null; end if;
  if l.hide_sensitive then b := public.strip_sensitive(b); end if;
  -- Les identifiants techniques du propriétaire ne sont pas exposés.
  b := b || jsonb_build_object('trip', (b -> 'trip') - 'user_id');
  return b || jsonb_build_object(
    'hide_sensitive', l.hide_sensitive,
    'owner_name', (select split_part(coalesce(u.email, ''), '@', 1) from auth.users u where u.id = l.user_id),
    'updated_at', b -> 'trip' -> 'updated_at'
  );
end $$;
revoke execute on function public.get_shared_roadbook(text) from public;
grant execute on function public.get_shared_roadbook(text) to anon, authenticated;

-- ===== supabase/migrations/0003_calendar.sql =====
-- Abonnement calendrier (adresse webcal:// secrète, distincte du partage).
create table public.calendar_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  include_legs boolean not null default true,
  include_checklist boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index calendar_links_one_active on public.calendar_links (trip_id) where active;
alter table public.calendar_links enable row level security;
grant select, insert, update, delete on public.calendar_links to authenticated;
revoke all on public.calendar_links from anon;
create policy owner_all on public.calendar_links for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create or replace function public.create_calendar_link(p_trip uuid, p_legs boolean, p_checklist boolean)
returns setof public.calendar_links language plpgsql security invoker set search_path = public as $$
begin
  update public.calendar_links set active = false, revoked_at = now() where trip_id = p_trip and active;
  return query insert into public.calendar_links (trip_id, include_legs, include_checklist)
    values (p_trip, p_legs, p_checklist) returning *;
end $$;
revoke execute on function public.create_calendar_link(uuid, boolean, boolean) from public, anon;
grant execute on function public.create_calendar_link(uuid, boolean, boolean) to authenticated;

-- Appelée uniquement par l'Edge Function « calendar » avec la clé service_role.
create or replace function public.get_calendar_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.calendar_links;
  b jsonb;
begin
  select * into l from public.calendar_links where token = p_token and active;
  if not found then return null; end if;
  b := public.trip_bundle_json(l.trip_id);
  if b -> 'trip' is null or b -> 'trip' = 'null'::jsonb then return null; end if;
  return b || jsonb_build_object('include_legs', l.include_legs, 'include_checklist', l.include_checklist);
end $$;
revoke execute on function public.get_calendar_bundle(text) from public, anon, authenticated;
grant execute on function public.get_calendar_bundle(text) to service_role;

-- ===== supabase/migrations/0004_privacy.sql =====
-- Confidentialité : nom affiché choisi par l'utilisateur, aucun identifiant de compte ni e-mail sur la page partagée,
-- fonctions internes fermées à l'API, lecture d'un voyage en un seul appel.

-- touch_trip ne sert qu'aux déclencheurs : Supabase l'ouvre par défaut à anon/authenticated, on referme.
revoke execute on function public.touch_trip(uuid) from public, anon, authenticated;
revoke execute on function public.touch_trip_from_row() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.strip_sensitive(jsonb) from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;
create policy owner_all on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Retire user_id de toutes les lignes d'un bundle.
create or replace function public.strip_owner(b jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('trip', (b -> 'trip') - 'user_id')
    || (select coalesce(jsonb_object_agg(k, coalesce((select jsonb_agg(e - 'user_id') from jsonb_array_elements(b -> k) e), '[]'::jsonb)), '{}'::jsonb)
        from unnest(array['days', 'stops', 'legs', 'reservations', 'checklist', 'contacts']) k);
$$;
revoke execute on function public.strip_owner(jsonb) from public, anon, authenticated;

create or replace function public.get_shared_roadbook(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.share_links;
  b jsonb;
begin
  select * into l from public.share_links where token = p_token and active;
  if not found then return null; end if;
  b := public.trip_bundle_json(l.trip_id);
  if b -> 'trip' is null or b -> 'trip' = 'null'::jsonb then return null; end if;
  if l.hide_sensitive then b := public.strip_sensitive(b); end if;
  b := public.strip_owner(b);
  return b || jsonb_build_object(
    'hide_sensitive', l.hide_sensitive,
    'owner_name', coalesce(
      (select nullif(btrim(p.display_name), '') from public.profiles p where p.user_id = l.user_id),
      'Voyageur'),
    'updated_at', b -> 'trip' -> 'updated_at'
  );
end $$;
revoke execute on function public.get_shared_roadbook(text) from public;
grant execute on function public.get_shared_roadbook(text) to anon, authenticated;

-- Voyage complet de l'utilisateur connecté, en un appel (les règles d'accès s'appliquent).
create or replace function public.get_my_trip_bundle(p_trip uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'trip', (select to_jsonb(t) from public.trips t where t.id = p_trip),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from public.days d where d.trip_id = p_trip), '[]'),
    'stops', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.stops s join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'legs', coalesce((select jsonb_agg(to_jsonb(l)) from public.legs l join public.stops s on s.id = l.from_stop_id join public.days d on d.id = s.day_id where d.trip_id = p_trip), '[]'),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r)) from public.reservations r where r.trip_id = p_trip), '[]'),
    'checklist', coalesce((select jsonb_agg(to_jsonb(c) order by c.position) from public.checklist_items c where c.trip_id = p_trip), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(k)) from public.contacts k where k.trip_id = p_trip), '[]')
  );
$$;
revoke execute on function public.get_my_trip_bundle(uuid) from public, anon;
grant execute on function public.get_my_trip_bundle(uuid) to authenticated;

-- ===== supabase/migrations/0005_budget.sql =====
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
