#!/usr/bin/env bash
# Teste les migrations Supabase sur un PostgreSQL local jetable.
# Utilise la CLI Supabase si elle est disponible avec Docker, sinon PostgreSQL 16 installé localement.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
if [ ! -x "$PGBIN/postgres" ]; then
  echo "PostgreSQL 16 introuvable ($PGBIN). Installe-le (apt install postgresql-16) ou indique PGBIN=…" >&2
  exit 1
fi

RUN=""
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; fi
TMP=$(mktemp -d)
chmod 777 "$TMP"
trap '$RUN "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

$RUN "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -p 54329 -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=(psql -h "$TMP" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t -A)
"${PSQL[@]}" -f supabase/tests/_supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done

status=0
for t in supabase/tests/rls.sql supabase/tests/sharing.sql supabase/tests/calendar.sql supabase/tests/privacy.sql; do
  echo "== $t"
  out=$("${PSQL[@]}" -f "$t" 2>&1) || status=1
  echo "$out" | sed 's/^psql:[^:]*:[0-9]*: //'
  if echo "$out" | grep -q "ÉCHEC\|ERROR"; then status=1; fi
done
[ $status -eq 0 ] && echo "Base de données : tous les tests passent." || echo "Base de données : des tests échouent." >&2
exit $status
