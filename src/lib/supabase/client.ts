import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase browser configuration is missing.');
  }

  return createSsrBrowserClient(url, anonKey);
}
