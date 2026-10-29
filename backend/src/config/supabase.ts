import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Admin Supabase client for backend token verification and admin tasks.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Creates a user-scoped Supabase client that enforces Row Level Security (RLS)
 * using the caller's Bearer JWT token.
 */
export function createRlsClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
    },
  });
}
