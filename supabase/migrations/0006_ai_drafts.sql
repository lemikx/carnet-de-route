-- Étape 3 : brouillons de création de voyage avec l'IA.
-- Table privée du propriétaire. Jamais lue par get_shared_roadbook, get_calendar_bundle ni trip_bundle_json
-- et sans déclencheur touch_trip : le partage ne doit pas trahir l'activité des brouillons.

create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('known', 'surprise')),
  stage text not null default 'brief' check (stage in (
    'brief', 'ideas_requested', 'ideas_received', 'idea_chosen', 'itinerary_requested', 'itinerary_received', 'created')),
  brief jsonb not null,
  ideas jsonb,
  chosen_idea_id text,
  itinerary jsonb,
  trip_id uuid references public.trips (id) on delete set null,
  protocol_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.ai_drafts (user_id, updated_at desc);
create index on public.ai_drafts (trip_id);

alter table public.ai_drafts enable row level security;
revoke all on public.ai_drafts from anon;
grant select, insert, update, delete on public.ai_drafts to authenticated;

create trigger set_updated_at before update on public.ai_drafts for each row execute function public.set_updated_at();

create policy owner_all on public.ai_drafts for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (trip_id is null or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  );
