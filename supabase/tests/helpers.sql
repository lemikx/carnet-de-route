-- Petites fonctions d'assertion (remplacent pgTAP, absent de l'environnement de test).
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok : %', label;
end $$;
