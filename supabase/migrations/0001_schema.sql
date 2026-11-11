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
