\i supabase/tests/helpers.sql
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'), ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ai_drafts (mode, brief) values ('known', '{"departureCity":"Toulouse","adults":2}');
create temp table t_tok as select create_connector_link() as tok;
grant select on t_tok to anon, service_role;
select pg_temp.ok(length((select tok from t_tok)) = 64, 'jeton de 64 caractères renvoyé');
select pg_temp.ok((select count(*) from connector_links where active) = 1, 'une adresse active');
select pg_temp.ok((select token_hash from connector_links where active) <> (select tok from t_tok), 'jeton stocké haché, jamais en clair');

-- Bob ne voit pas l'adresse d'Alice ; personne ne peut lire le jeton par les fonctions serveur sans service_role.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from connector_links) = 0, 'Bob ne voit pas l''adresse d''Alice');
do $$ begin
  perform connector_last_brief((select tok from t_tok));
  raise exception 'ÉCHEC : un utilisateur appelle connector_last_brief';
exception when insufficient_privilege then raise notice 'ok : connector_last_brief réservé au serveur';
end $$;
do $$ begin
  perform connector_create_draft((select tok from t_tok), '{}', '{}');
  raise exception 'ÉCHEC : un utilisateur appelle connector_create_draft';
exception when insufficient_privilege then raise notice 'ok : connector_create_draft réservé au serveur';
end $$;
do $$ begin
  insert into connector_links (token_hash) values ('x');
  raise exception 'ÉCHEC : insertion directe acceptée';
exception when insufficient_privilege then raise notice 'ok : pas d''insertion directe';
end $$;

set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  perform 1 from connector_links;
  raise exception 'ÉCHEC : anon lit les adresses';
exception when insufficient_privilege then raise notice 'ok : anon ne lit pas les adresses';
end $$;

-- Le serveur (service_role) dépose un brouillon pour Alice seulement.
set local role service_role;
select pg_temp.ok(connector_last_brief('mauvais') is null, 'jeton inconnu refusé');
select pg_temp.ok(connector_last_brief((select tok from t_tok)) -> 'brief' ->> 'departureCity' = 'Toulouse', 'dernier questionnaire renvoyé');
create temp table t_d as select connector_create_draft((select tok from t_tok), '{"destination":"Madère"}', '{"v":1}') as id;
select pg_temp.ok((select user_id from ai_drafts where id = (select id from t_d)) = '00000000-0000-0000-0000-00000000000a', 'brouillon attribué à Alice');
select pg_temp.ok((select stage from ai_drafts where id = (select id from t_d)) = 'itinerary_received', 'brouillon prêt à valider');
do $$ begin
  perform connector_create_draft('mauvais', '{}', '{}');
  raise exception 'ÉCHEC : jeton inconnu accepté';
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if sqlerrm <> 'UNAUTHORIZED' then raise exception 'ÉCHEC : %', sqlerrm; end if;
  raise notice 'ok : dépôt refusé sans jeton valide';
end $$;
do $$ declare i int; begin
  for i in 1..30 loop perform connector_create_draft((select tok from t_tok), '{}', '{}'); end loop;
  raise exception 'ÉCHEC : plus de 20 brouillons par jour';
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if sqlerrm <> 'RATE_LIMIT' then raise exception 'ÉCHEC : %', sqlerrm; end if;
  raise notice 'ok : 20 brouillons par jour au plus';
end $$;

-- Révocation : l'ancien jeton ne marche plus.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select revoke_connector_link();
set local role service_role;
select pg_temp.ok(connector_last_brief((select tok from t_tok)) is null, 'jeton révoqué refusé');
rollback;
