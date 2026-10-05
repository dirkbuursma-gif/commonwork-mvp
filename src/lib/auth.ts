import type { SupabaseServerContext } from './supabase/server';
import { createSupabaseServerClient } from './supabase/server';

export async function getCurrentUser(
  context: SupabaseServerContext,
): Promise<App.User | null> {
  const supabase = createSupabaseServerClient(context);
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    user_metadata: data.user.user_metadata,
  };
}
