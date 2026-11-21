-- Connecteur Claude « Carnet de route » : adresse secrète qui permet à Claude de déposer un brouillon de voyage.
-- Claude ne peut rien lire ni modifier d'autre : la fonction serveur n'appelle que les deux fonctions ci-dessous.

create table public.connector_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index connector_links_one_active on public.connector_links (user_id) where active;
alter table public.connector_links enable row level security;
revoke all on public.connector_links from anon;
grant select on public.connector_links to authenticated;
create policy owner_read on public.connector_links for select to authenticated using (user_id = auth.uid());

-- Crée une nouvelle adresse (l'ancienne est révoquée) ; le jeton n'est renvoyé qu'ici, en clair, une seule fois.
create or replace function public.create_connector_link() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  update public.connector_links set active = false, revoked_at = now() where user_id = auth.uid() and active;
  t := encode(gen_random_bytes(32), 'hex');
  insert into public.connector_links (user_id, token_hash) values (auth.uid(), encode(digest(t, 'sha256'), 'hex'));
  return t;
end $$;
revoke execute on function public.create_connector_link() from public, anon;
grant execute on function public.create_connector_link() to authenticated;

create or replace function public.revoke_connector_link() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.connector_links set active = false, revoked_at = now() where user_id = auth.uid() and active;
end $$;
revoke execute on function public.revoke_connector_link() from public, anon;
grant execute on function public.revoke_connector_link() to authenticated;

create or replace function public.connector_user(p_token text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select user_id from public.connector_links
  where active and token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
revoke execute on function public.connector_user(text) from public, anon, authenticated;

-- Appelées uniquement par la fonction serveur « claude-connector » (clé service_role).
-- null = jeton invalide ; sinon { brief: dernier questionnaire ou null }.
create or replace function public.connector_last_brief(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare u uuid := public.connector_user(p_token);
begin
  if u is null then return null; end if;
  return jsonb_build_object('brief',
    (select brief from public.ai_drafts where user_id = u order by updated_at desc limit 1));
end $$;
revoke execute on function public.connector_last_brief(text) from public, anon, authenticated;
grant execute on function public.connector_last_brief(text) to service_role;

create or replace function public.connector_create_draft(p_token text, p_brief jsonb, p_itinerary jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  u uuid := public.connector_user(p_token);
  d uuid;
begin
  if u is null then raise exception 'UNAUTHORIZED'; end if;
  if (select count(*) from public.ai_drafts where user_id = u and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.ai_drafts (user_id, mode, stage, brief, itinerary, protocol_version)
    values (u, 'known', 'itinerary_received', p_brief, p_itinerary, 1)
    returning id into d;
  return d;
end $$;
revoke execute on function public.connector_create_draft(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.connector_create_draft(text, jsonb, jsonb) to service_role;
