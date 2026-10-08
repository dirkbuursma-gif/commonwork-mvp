import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { logPilotFailure } from '../../../lib/observability';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function redirect(context: Parameters<APIRoute>[0], matchId: string, status: string) {
  return context.redirect(`/introductions/request/${matchId}?status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/find?status=preview-readonly', 303);
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const matchId = value(form, 'match_id');
  const route = value(form, 'route');
  const suggestedId = value(form, 'suggested_introducer_id') || null;
  const connectorId = value(form, 'trusted_connector_id') || null;
  const { data: introductionId, error } = await supabase.rpc('request_introduction', {
    target_match_id: matchId,
    target_route: route,
    target_suggested_introducer_id: suggestedId,
    target_trusted_connector_id: connectorId,
    target_why_this_person: value(form, 'why_this_person'),
    target_why_now: value(form, 'why_now'),
    target_proposed_conversation: value(form, 'proposed_conversation'),
    target_requester_offer: value(form, 'requester_offer'),
    target_contact_method_id: value(form, 'contact_method_id'),
    target_intermediary_note: value(form, 'intermediary_note'),
  });

  if (error) logPilotFailure('introduction_request_failed', error, {
    actor_profile_id: user.id,
    match_id: matchId,
    action: route,
  });
  if (error || !introductionId) return redirect(context, matchId, 'request-unavailable');
  return context.redirect(`/introductions/${introductionId}?status=request-sent`, 303);
};