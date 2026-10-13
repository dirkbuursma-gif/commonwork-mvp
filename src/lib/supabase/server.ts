import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { APIContext } from 'astro';
import { isSessionCookieWriteAttempt } from '../auth-callback-diagnostics';

export type SupabaseServerContext = Pick<APIContext, 'cookies' | 'request'>;
type SupabaseServerClientOptions = {
  onSessionCookieWriteAttempt?: () => void;
};

export function createSupabaseServerClient(
  context: SupabaseServerContext,
  options: SupabaseServerClientOptions = {},
) {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () =>
        parseCookieHeader(context.request.headers.get('cookie') ?? ''),
      setAll: (cookiesToSet) => {
        if (isSessionCookieWriteAttempt(cookiesToSet)) {
          options.onSessionCookieWriteAttempt?.();
        }
        const secure = new URL(context.request.url).protocol === 'https:';
        cookiesToSet.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure,
          });
        });
      },
    },
  });
}
