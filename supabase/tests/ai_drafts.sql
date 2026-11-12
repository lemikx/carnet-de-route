\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'), ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-02');
insert into days (id, trip_id, date) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-12-01');
insert into ai_drafts (id, mode, brief, trip_id) values
  ('70000000-0000-0000-0000-000000000001', 'surprise', '{"constraints":"brief-secret-xyz","travelers":[{"nationality":"FR"}]}', '10000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from ai_drafts) = 1, 'Alice voit son brouillon');
create temp table t_link as select * from create_share_link('10000000-0000-0000-0000-000000000001', false);
create temp table t_cal as select * from create_calendar_link('10000000-0000-0000-0000-000000000001', true, true);
grant select on t_link, t_cal to anon, service_role;

-- Le stade est contrôlé.
do $$ begin
  insert into ai_drafts (mode, stage, brief) values ('known', 'nimporte', '{}');
  raise exception 'ÉCHEC : stade invalide accepté';
exception when check_violation then raise notice 'ok : stade invalide refusé';
end $$;

-- Bob ne voit rien et ne peut rien faire.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from ai_drafts) = 0, 'Bob ne voit pas le brouillon d''Alice');
do $$ begin
  insert into ai_drafts (mode, brief, trip_id) values ('known', '{}', '10000000-0000-0000-0000-000000000001');
  raise exception 'ÉCHEC : brouillon rattaché au voyage d''Alice';
exception when insufficient_privilege then raise notice 'ok : rattachement au voyage d''Alice refusé';
end $$;
update ai_drafts set stage = 'created' where id = '70000000-0000-0000-0000-000000000001';
delete from ai_drafts where id = '70000000-0000-0000-0000-000000000001';

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select stage from ai_drafts) = 'brief', 'le brouillon d''Alice est intact');

-- Aucun accès anonyme.
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  perform 1 from ai_drafts;
  raise exception 'ÉCHEC : anon lit les brouillons';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas les brouillons';
end $$;

-- Ni le partage ni le calendrier ne contiennent de brouillon.
select pg_temp.ok(position('brief-secret-xyz' in (select get_shared_roadbook(token)::text from t_link)) = 0, 'partage : aucun contenu de brouillon');
select pg_temp.ok(position('ai_drafts' in (select get_shared_roadbook(token)::text from t_link)) = 0, 'partage : aucune table de brouillons');
set local role service_role;
select pg_temp.ok(position('brief' in (select get_calendar_bundle(token)::text from t_cal)) = 0, 'calendrier : aucun brouillon');

-- Supprimer le voyage garde le brouillon, sans voyage.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from trips where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from ai_drafts) = 1 and (select trip_id from ai_drafts) is null, 'brouillon conservé, trip_id à null');
rollback;
