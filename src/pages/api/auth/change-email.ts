import type { APIRoute } from 'astro';
import { validateIntelligenceReturnPath } from '../../../lib/auth-return-path';
import { clearPendingSignIn } from '../../../lib/email-code-auth';

// Clears only the pending sign-in cookie. It never touches the Supabase session and sends no email.
export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const returnPath = validateIntelligenceReturnPath(formData.get('return_to'));
  clearPendingSignIn(context.cookies);
  return context.redirect(returnPath ? `/sign-in?return_to=${encodeURIComponent(returnPath)}` : '/sign-in', 303);
};
