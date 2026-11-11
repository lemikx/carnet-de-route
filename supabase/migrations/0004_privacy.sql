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
