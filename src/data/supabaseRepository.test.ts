import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from './supabaseRepository';
import { runRepositoryContract } from './repositoryContract';

// Exécuté seulement contre un vrai projet Supabase de test (variables SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY,
// SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD).
const url = process.env.SUPABASE_TEST_URL;
if (url) {
  runRepositoryContract('Supabase', async () => {
    const client = createClient(url, process.env.SUPABASE_TEST_ANON_KEY!);
    await client.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_EMAIL!, password: process.env.SUPABASE_TEST_PASSWORD! });
    return createSupabaseRepository(client);
  });
} else {
  it.skip('contrat Supabase (SUPABASE_TEST_URL non défini)', () => {});
}
