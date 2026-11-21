-- Billet de vol : codes d'aéroport (départ, arrivée), siège, porte et terminal, tous facultatifs.
-- Les règles d'accès (RLS) de la table reservations ne changent pas ; les fonctions de partage
-- utilisent to_jsonb(r), les nouvelles colonnes suivent donc sans autre modification.

alter table public.reservations
  add column if not exists departure_code text,
  add column if not exists arrival_code text,
  add column if not exists seat text,
  add column if not exists gate text,
  add column if not exists terminal text;
