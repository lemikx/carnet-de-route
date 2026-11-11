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
