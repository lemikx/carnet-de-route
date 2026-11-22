\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values
  ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-02'),
  ('10000000-0000-0000-0000-000000000002', 'Autre voyage', '2027-01-01', '2027-01-02');
insert into days (id, trip_id, date, note) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-12-01', 'SECRET-day');
insert into reservations (id, trip_id, type, title, start_at, confirmation_number, price, url, note) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'lodging', 'Hôtel', '{"date":"2026-12-01","time":"15:00","timezone":"Asia/Tokyo"}', 'SECRET-conf', 4242, 'https://SECRET', 'SECRET-note');
insert into reservations (id, trip_id, type, title, start_at, departure_code, arrival_code, seat, gate, terminal) values
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'flight', 'Vol Paris-Tokyo', '{"date":"2026-12-01","time":"10:00","timezone":"Europe/Paris"}', 'CDG', 'HND', '14C', 'K42', '2E');
insert into stops (day_id, position, title, note, url, reservation_id) values
  ('20000000-0000-0000-0000-000000000001', 0, 'Hôtel', 'SECRET-stop', 'https://SECRET-stop', '40000000-0000-0000-0000-000000000001');
insert into contacts (trip_id, name, note) values ('10000000-0000-0000-0000-000000000001', 'Ambassade', 'SECRET-contact');

create temp table t_links as select * from create_share_link('10000000-0000-0000-0000-000000000001', true);
grant select on t_links to anon;
select pg_temp.ok((select token ~ '^[0-9a-f]{32}$' from t_links), 'jeton de 32 caractères hexadécimaux');

set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) from t_links) ->> 'owner_name' = 'Voyageur', 'anon lit le roadbook partagé');
select pg_temp.ok((select (get_shared_roadbook(token) -> 'trip' ->> 'name') from t_links) = 'Japon', 'voyage du lien');
select pg_temp.ok(position('SECRET' in (select get_shared_roadbook(token)::text from t_links)) = 0, 'aucune info sensible quand masqué');
select pg_temp.ok((select r ->> 'seat' is null and r ->> 'gate' is null and r ->> 'terminal' is null
  from jsonb_array_elements(get_shared_roadbook((select token from t_links)) -> 'reservations') r where r ->> 'type' = 'flight'), 'siège, porte et terminal masqués');
select pg_temp.ok((select r ->> 'departure_code' = 'CDG' and r ->> 'arrival_code' = 'HND'
  from jsonb_array_elements(get_shared_roadbook((select token from t_links)) -> 'reservations') r where r ->> 'type' = 'flight'), 'codes d''aéroport conservés');
select pg_temp.ok(position('4242' in (select get_shared_roadbook(token)::text from t_links)) = 0, 'prix masqué');
select pg_temp.ok(position('10000000-0000-0000-0000-000000000002' in (select get_shared_roadbook(token)::text from t_links)) = 0, 'jamais un autre voyage');
select pg_temp.ok(get_shared_roadbook('00000000000000000000000000000000') is null, 'jeton inconnu → null');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table t_links2 as select * from create_share_link('10000000-0000-0000-0000-000000000001', false);
grant select on t_links2 to anon;
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) from t_links) is null, 'ancien lien désactivé → null');
select pg_temp.ok(position('SECRET-conf' in (select get_shared_roadbook(token)::text from t_links2)) > 0, 'infos visibles si non masquées');
select pg_temp.ok((select r ->> 'seat' = '14C' and r ->> 'gate' = 'K42' and r ->> 'terminal' = '2E'
  from jsonb_array_elements(get_shared_roadbook((select token from t_links2)) -> 'reservations') r where r ->> 'type' = 'flight'), 'siège, porte et terminal visibles si non masqué');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from trips where id = '10000000-0000-0000-0000-000000000001';
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) from t_links2) is null, 'voyage supprimé → null');
rollback;
