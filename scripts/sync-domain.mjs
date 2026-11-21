// Copie le code métier (src/domain + conversion Supabase) dans supabase/functions/_shared
// en l'adaptant à Deno (extensions .ts, luxon via npm:). À lancer avant chaque déploiement des fonctions.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'supabase/functions/_shared');
rmSync(out, { recursive: true, force: true });

function adapt(src) {
  return src
    .replace(/from 'luxon'/g, "from 'npm:luxon@3.5.0'")
    .replace(/from '(\.{1,2}\/[^']+?)(?<!\.ts)'/g, "from '$1.ts'");
}

function copy(fromDir, toDir, filter) {
  mkdirSync(join(out, toDir), { recursive: true });
  for (const f of readdirSync(join(root, fromDir))) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts') || !filter(f)) continue;
    writeFileSync(join(out, toDir, f), adapt(readFileSync(join(root, fromDir, f), 'utf8')));
  }
}

copy('src/domain', 'domain', () => true);
copy('src/domain/budget', 'domain/budget', () => true);
copy('src/data', 'data', (f) => f === 'supabaseMapping.ts');
// Validation et consignes de l'IA, partagées avec le connecteur Claude.
copy('src/ai', 'ai', (f) => ['types.ts', 'limits.ts', 'options.ts', 'validate.ts', 'responseParser.ts', 'promptBuilder.ts'].includes(f));
console.log('Code métier copié dans supabase/functions/_shared');
