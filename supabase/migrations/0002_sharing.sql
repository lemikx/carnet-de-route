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
