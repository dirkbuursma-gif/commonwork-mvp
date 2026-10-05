import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const allowedOtpTypes: EmailOtpType[] = ['email', 'magiclink'];

export const GET: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);
  if (!supabase) {
    return context.redirect('/sign-in?status=configuration', 303);
  }

  const { searchParams } = new URL(context.request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type') as EmailOtpType | null;

  let error: Error | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && otpType && allowedOtpTypes.includes(otpType)) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    }));
  } else {
    return context.redirect('/sign-in?status=invalid-link', 303);
  }

  return context.redirect(
    error ? '/sign-in?status=invalid-link' : '/today',
    303,
  );
};
