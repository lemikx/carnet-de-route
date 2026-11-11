\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'), ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

-- Alice prépare un voyage avec un budget.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000001', 'Japon', '2026-12-01', '2026-12-05');
update trips set budget_cap = 3000, budget_cap_mode = 'per_person', fx_margin_pct = 7 where id = '10000000-0000-0000-0000-000000000001';
insert into reservations (id, trip_id, type, title, start_at, price, currency) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'lodging', 'Hôtel', '{"date":"2026-12-01","time":"15:00","timezone":"Asia/Tokyo"}', 800, 'EUR');
insert into travelers (id, trip_id, name, position) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alice', 0),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Bob', 1);
insert into budget_lines (id, trip_id, category, label, amount, currency, mode, rate_to_eur) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'food', 'Repas', 40, 'EUR', 'per_person_per_day', 1);
select pg_temp.ok(save_expense(
  '{"trip_id":"10000000-0000-0000-0000-000000000001","date":"2026-12-01","category":"food","label":"Dîner","amount":6000,"currency":"JPY","rate_to_eur":0.0061,"paid_by":"50000000-0000-0000-0000-000000000001","line_id":"60000000-0000-0000-0000-000000000001"}'::jsonb,
  array['50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002']::uuid[]) ->> 'label' = 'Dîner', 'Alice enregistre une dépense avec ses parts');
select pg_temp.ok(jsonb_array_length(get_my_budget('10000000-0000-0000-0000-000000000001') -> 'expenses') = 1, 'get_my_budget renvoie la dépense');
select pg_temp.ok(jsonb_array_length(get_my_budget('10000000-0000-0000-0000-000000000001') -> 'expenses' -> 0 -> 'participant_ids') = 2, 'avec ses deux participants');

-- Refus : aucun participant, deux rattachements.
do $$ begin
  perform save_expense('{"trip_id":"10000000-0000-0000-0000-000000000001","date":"2026-12-01","category":"food","label":"x","amount":1,"currency":"EUR","rate_to_eur":1,"paid_by":"50000000-0000-0000-0000-000000000001"}'::jsonb, array[]::uuid[]);
  raise exception 'ÉCHEC : dépense sans participant acceptée';
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise notice 'ok : dépense sans participant refusée';
end $$;
do $$ begin
  perform save_expense('{"trip_id":"10000000-0000-0000-0000-000000000001","date":"2026-12-01","category":"food","label":"x","amount":1,"currency":"EUR","rate_to_eur":1,"paid_by":"50000000-0000-0000-0000-000000000001","line_id":"60000000-0000-0000-0000-000000000001","reservation_id":"40000000-0000-0000-0000-000000000001"}'::jsonb, array['50000000-0000-0000-0000-000000000001']::uuid[]);
  raise exception 'ÉCHEC : deux rattachements acceptés';
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise notice 'ok : deux rattachements refusés';
end $$;
do $$ begin
  delete from travelers where id = '50000000-0000-0000-0000-000000000001';
  raise exception 'ÉCHEC : un voyageur payeur a été supprimé';
exception when foreign_key_violation then raise notice 'ok : suppression d''un voyageur payeur refusée';
end $$;

-- Bob ne voit rien et ne peut rien ajouter chez Alice.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from travelers) = 0, 'Bob ne voit pas les voyageurs');
select pg_temp.ok((select count(*) from budget_lines) = 0, 'Bob ne voit pas les lignes');
select pg_temp.ok((select count(*) from expenses) = 0, 'Bob ne voit pas les dépenses');
select pg_temp.ok((select count(*) from expense_shares) = 0, 'Bob ne voit pas les parts');
select pg_temp.ok(get_my_budget('10000000-0000-0000-0000-000000000001') is null, 'Bob ne lit pas le budget d''Alice');
do $$ begin
  insert into travelers (trip_id, name, position) values ('10000000-0000-0000-0000-000000000001', 'Intrus', 9);
  raise exception 'ÉCHEC : Bob a ajouté un voyageur chez Alice';
exception when insufficient_privilege then raise notice 'ok : Bob ne peut pas ajouter de voyageur chez Alice';
end $$;

-- Aucun accès pour anon.
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin perform 1 from travelers; raise exception 'ÉCHEC : anon lit travelers';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas travelers'; end $$;
do $$ begin perform 1 from expenses; raise exception 'ÉCHEC : anon lit expenses';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas expenses'; end $$;
do $$ begin perform get_my_budget('10000000-0000-0000-0000-000000000001'); raise exception 'ÉCHEC : anon exécute get_my_budget';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas exécuter get_my_budget'; end $$;
do $$ begin perform save_expense('{}'::jsonb, array[]::uuid[]); raise exception 'ÉCHEC : anon exécute save_expense';
exception when insufficient_privilege then raise notice 'ok : anon ne peut pas exécuter save_expense'; end $$;

-- Le partage et le calendrier ne contiennent aucune trace du budget.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
create temp table t_share as select * from create_share_link('10000000-0000-0000-0000-000000000001', false);
create temp table t_cal as select * from create_calendar_link('10000000-0000-0000-0000-000000000001', true, true);
grant select on t_share, t_cal to anon, service_role;
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.ok((select get_shared_roadbook(token) from t_share) is not null, 'le partage fonctionne');
select pg_temp.ok((select get_shared_roadbook(token)::text !~ 'budget_cap|fx_margin|travelers|expenses|budget_lines|participant_ids|Dîner' from t_share), 'aucune trace du budget dans le roadbook partagé');
set local role service_role;
select pg_temp.ok((select get_calendar_bundle(token) from t_cal) is not null, 'l''abonnement calendrier fonctionne');
select pg_temp.ok((select get_calendar_bundle(token)::text !~ 'budget_cap|fx_margin|travelers|expenses|budget_lines|participant_ids|Dîner' from t_cal), 'aucune trace du budget dans le calendrier');

-- Suppressions : les dépenses restent, hors prévu.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from budget_lines where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from expenses where line_id is null) = 1, 'la dépense reste quand sa ligne est supprimée');

-- Modifier seulement le budget ne change pas la date « mis à jour le » du partage ; modifier le voyage oui.
update trips set updated_at = '2020-01-01' where id = '10000000-0000-0000-0000-000000000001';
update trips set budget_cap = 3500, fx_margin_pct = 4 where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select updated_at from trips where id = '10000000-0000-0000-0000-000000000001') = '2020-01-01', 'modifier le budget ne change pas la date de mise à jour');
update trips set name = 'Japon 2026' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select updated_at from trips where id = '10000000-0000-0000-0000-000000000001') > '2020-01-01', 'modifier le voyage met la date à jour');

-- Une dépense ne peut concerner que des voyageurs de son propre voyage.
insert into trips (id, name, start_date, end_date) values ('10000000-0000-0000-0000-000000000002', 'Autre', '2027-01-01', '2027-01-03');
insert into travelers (id, trip_id, name, position) values ('50000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000002', 'Étranger', 0);
do $$ begin
  perform save_expense('{"trip_id":"10000000-0000-0000-0000-000000000001","date":"2026-12-01","category":"food","label":"x","amount":1,"currency":"EUR","rate_to_eur":1,"paid_by":"50000000-0000-0000-0000-000000000002"}'::jsonb, array['50000000-0000-0000-0000-000000000099']::uuid[]);
  raise exception 'ÉCHEC : un voyageur d''un autre voyage a été accepté';
exception when insufficient_privilege then raise notice 'ok : un voyageur d''un autre voyage est refusé';
end $$;

-- Un budget de 300 dépenses se charge en un appel.
insert into expenses (trip_id, date, category, label, amount, currency, rate_to_eur, paid_by)
  select '10000000-0000-0000-0000-000000000001', '2026-12-02', 'food', 'Repas ' || g, 10, 'EUR', 1, '50000000-0000-0000-0000-000000000001' from generate_series(1, 300) g;
insert into expense_shares (expense_id, traveler_id)
  select e.id, '50000000-0000-0000-0000-000000000001' from expenses e where e.label like 'Repas %';
select pg_temp.ok(jsonb_array_length(get_my_budget('10000000-0000-0000-0000-000000000001') -> 'expenses') = 301, '301 dépenses chargées en un appel');

-- Supprimer le voyage supprime tout le budget.
delete from trips where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from travelers where trip_id = '10000000-0000-0000-0000-000000000001') + (select count(*) from expenses) + (select count(*) from budget_lines) = 0, 'le budget disparaît avec le voyage');
rollback;
