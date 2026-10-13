import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../../lib/auth-return-path';
import { logPilotFailure } from '../../../lib/observability';
import { normalizeEmail, requestEmailCode, signInPath, writePendingSignIn } from '../../../lib/email-code-auth';

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = normalizeEmail(formData.get('email'));
  const returnPath = validateIntelligenceReturnPath(formData.get('return_to'));

  if (!email) return context.redirect(signInPath('/sign-in', 'invalid', returnPath), 303);

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect(signInPath('/sign-in', 'configuration', returnPath), 303);

  const outcome = await requestEmailCode(supabase, email, (error) =>
    logPilotFailure('email_code_send_failed', error, { action: 'email_code' }),
  );
  if (outcome === 'rate_limited') return context.redirect(signInPath('/sign-in', 'rate-limited', returnPath), 303);
  if (outcome === 'unavailable') return context.redirect(signInPath('/sign-in', 'unavailable', returnPath), 303);

  writePendingSignIn(context.cookies, { email, sentAt: Date.now() }, context.request.url);
  return context.redirect(signInPath('/sign-in/code', 'sent', returnPath), 303);
};
