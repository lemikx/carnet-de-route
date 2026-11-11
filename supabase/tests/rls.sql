\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'), ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-03');
insert into days (id, trip_id, date) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-12-01');
insert into stops (id, day_id, position, title) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0, 'Temple');
insert into reservations (trip_id, type, title, start_at, confirmation_number) values ('10000000-0000-0000-0000-000000000001', 'lodging', 'Hôtel', '{"date":"2026-12-01","time":"15:00","timezone":"Asia/Tokyo"}', 'SECRET');
insert into checklist_items (trip_id, category, label) values ('10000000-0000-0000-0000-000000000001', 'documents', 'Passeport');
insert into contacts (trip_id, name) values ('10000000-0000-0000-0000-000000000001', 'Ambassade');
select pg_temp.ok((select count(*) from trips) = 1, 'Alice voit son voyage');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from trips) = 0, 'Bob ne voit pas les voyages d''Alice');
select pg_temp.ok((select count(*) from days) = 0, 'Bob ne voit pas les jours');
select pg_temp.ok((select count(*) from stops) = 0, 'Bob ne voit pas les lieux');
select pg_temp.ok((select count(*) from reservations) = 0, 'Bob ne voit pas les réservations');
select pg_temp.ok((select count(*) from checklist_items) = 0, 'Bob ne voit pas la checklist');
select pg_temp.ok((select count(*) from contacts) = 0, 'Bob ne voit pas les contacts');
update trips set name = 'piraté';
delete from trips;

do $$ begin
  insert into stops (day_id, position, title) values ('20000000-0000-0000-0000-000000000001', 1, 'Intrus');
  raise exception 'ÉCHEC : Bob a pu ajouter un lieu au voyage d''Alice';
exception when insufficient_privilege or check_violation then raise notice 'ok : Bob ne peut pas ajouter de lieu chez Alice';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select name from trips) = 'Japon', 'Bob n''a pu ni modifier ni supprimer');

set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  perform 1 from trips;
  raise exception 'ÉCHEC : anon lit la table trips';
exception when insufficient_privilege then raise notice 'ok : anon n''a aucun accès direct aux tables';
end $$;
rollback;
