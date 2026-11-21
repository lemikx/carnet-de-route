-- Photo libre de droits par étape (Wikimedia Commons) : l'image, l'auteur et la licence,
-- pour l'attribution obligatoire. Les règles d'accès (RLS) de la table stops ne changent pas.

alter table public.stops
  add column if not exists photo_url text,
  add column if not exists photo_credit text,
  add column if not exists photo_license text,
  add column if not exists photo_license_url text;
