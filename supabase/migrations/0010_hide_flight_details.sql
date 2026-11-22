-- Partage « masquer les infos sensibles » : le siège, la porte et le terminal des réservations sont aussi retirés
-- (les codes d'aéroport restent visibles).

create or replace function public.strip_sensitive(b jsonb) returns jsonb language sql immutable as $$
  select b
    || jsonb_build_object('days', coalesce((select jsonb_agg(d || '{"note":""}') from jsonb_array_elements(b -> 'days') d), '[]'))
    || jsonb_build_object('stops', coalesce((select jsonb_agg(
         s || jsonb_build_object('note', '', 'url', case when s ->> 'reservation_id' is null then s ->> 'url' else '' end)
       ) from jsonb_array_elements(b -> 'stops') s), '[]'))
    || jsonb_build_object('reservations', coalesce((select jsonb_agg(
         r || '{"confirmation_number":"","price":null,"currency":"","url":"","note":"","seat":null,"gate":null,"terminal":null}'
       ) from jsonb_array_elements(b -> 'reservations') r), '[]'))
    || jsonb_build_object('contacts', coalesce((select jsonb_agg(k || '{"note":""}') from jsonb_array_elements(b -> 'contacts') k), '[]'));
$$;
revoke execute on function public.strip_sensitive(jsonb) from public, anon, authenticated;
