\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'), ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-02');
insert into days (id, trip_id, date) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-12-01');
insert into stops (day_id, position, title) values ('20000000-0000-0000-0000-000000000001', 0, 'Temple');
insert into contacts (trip_id, name) values ('10000000-0000-0000-0000-000000000001', 'Ambassade');
create temp table t_link as select * from create_share_link('10000000-0000-0000-0000-000000000001', true);
grant select on t_link to anon;

-- Nom affiché : jamais l'adresse e-mail.
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) ->> 'owner_name' from t_link) = 'Voyageur', 'nom par défaut sans e-mail');
select pg_temp.ok(position('alice' in (select get_shared_roadbook(token)::text from t_link)) = 0, 'aucune trace de l''e-mail');
select pg_temp.ok(position('user_id' in (select get_shared_roadbook(token)::text from t_link)) = 0, 'aucun identifiant de compte');
select pg_temp.ok(position('00000000-0000-0000-0000-00000000000a' in (select get_shared_roadbook(token)::text from t_link)) = 0, 'identifiant du propriétaire absent');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into profiles (display_name) values ('lemikxfamily');
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) ->> 'owner_name' from t_link) = 'lemikxfamily', 'nom choisi affiché');
do $$ begin
  perform 1 from profiles;
  raise exception 'ÉCHEC : anon lit les profils';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas les profils';
end $$;

-- touch_trip n'est appelable par personne depuis l'API.
do $$ begin
  perform touch_trip('10000000-0000-0000-0000-000000000001');
  raise exception 'ÉCHEC : anon exécute touch_trip';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas exécuter touch_trip';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform touch_trip('10000000-0000-0000-0000-000000000001');
  raise exception 'ÉCHEC : un utilisateur exécute touch_trip';
exception when insufficient_privilege then raise notice 'ok : authenticated ne peut pas exécuter touch_trip';
end $$;

-- Lecture d'un voyage en un seul appel (pas de longue liste d'identifiants dans l'URL).
select pg_temp.ok(get_my_trip_bundle('10000000-0000-0000-0000-000000000001') -> 'trip' = 'null'::jsonb
  or get_my_trip_bundle('10000000-0000-0000-0000-000000000001') -> 'trip' is null, 'Bob ne lit pas le voyage d''Alice');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into stops (day_id, position, title)
  select '20000000-0000-0000-0000-000000000001', g, 'Étape ' || g from generate_series(1, 400) g;
insert into legs (from_stop_id, to_stop_id)
  select a.id, b.id from stops a join stops b on b.position = a.position + 1 and b.day_id = a.day_id;
select pg_temp.ok(jsonb_array_length(get_my_trip_bundle('10000000-0000-0000-0000-000000000001') -> 'stops') = 401, 'voyage de 401 étapes chargé');
select pg_temp.ok(jsonb_array_length(get_my_trip_bundle('10000000-0000-0000-0000-000000000001') -> 'legs') = 400, '400 trajets chargés');
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  perform get_my_trip_bundle('10000000-0000-0000-0000-000000000001');
  raise exception 'ÉCHEC : anon exécute get_my_trip_bundle';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas exécuter get_my_trip_bundle';
end $$;
rollback;
