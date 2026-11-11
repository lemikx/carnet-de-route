\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-02');
insert into reservations (trip_id, type, title, start_at, confirmation_number) values
  ('10000000-0000-0000-0000-000000000001', 'flight', 'AF276', '{"date":"2026-12-01","time":"10:00","timezone":"Europe/Paris"}', 'ABC123');
create temp table t_share as select * from create_share_link('10000000-0000-0000-0000-000000000001', true);
create temp table t_cal as select * from create_calendar_link('10000000-0000-0000-0000-000000000001', true, false);
grant select on t_share, t_cal to service_role, anon;
select pg_temp.ok((select token from t_cal) <> (select token from t_share), 'jeton calendrier distinct du jeton de partage');

do $$ begin
  perform get_calendar_bundle((select token from t_cal));
  raise exception 'ÉCHEC : authenticated peut exécuter get_calendar_bundle';
exception when insufficient_privilege then raise notice 'ok : authenticated ne peut pas lire le calendrier';
end $$;
set local role anon;
do $$ begin
  perform get_calendar_bundle((select token from t_cal));
  raise exception 'ÉCHEC : anon peut exécuter get_calendar_bundle';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas lire le calendrier';
end $$;

set local role service_role;
select pg_temp.ok(position('ABC123' in (select get_calendar_bundle(token)::text from t_cal)) > 0, 'service_role lit le bundle complet');
select pg_temp.ok((select (get_calendar_bundle(token) ->> 'include_checklist')::boolean from t_cal) = false, 'options renvoyées');
select pg_temp.ok((select get_calendar_bundle(token) from t_share) is null, 'un jeton de partage ne marche pas');
select pg_temp.ok(get_calendar_bundle('00000000000000000000000000000000') is null, 'jeton inconnu → null');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update calendar_links set active = false;
set local role service_role;
select pg_temp.ok((select get_calendar_bundle(token) from t_cal) is null, 'abonnement désactivé → null');
rollback;
