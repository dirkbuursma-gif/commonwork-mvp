import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { logPilotFailure } from '../../../lib/observability';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/profiles/me?status=preview-readonly', 303);
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin privacy action rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);
  const form = await context.request.formData();
  const action = value(form, 'action');
  let status = 'privacy-action-unavailable';

  if (action === 'export') {
    status = 'export-ready';
    return context.redirect('/api/privacy/export', 303);
  }
  if (action === 'deactivate') {
    const { error } = await supabase.rpc('deactivate_my_member_profile');
    if (error) logPilotFailure('profile_deactivation_failed', error, { actor_profile_id: user.id, action });
    status = error ? 'privacy-action-failed' : 'profile-deactivated';
  } else if (action === 'request-deletion' || action === 'request-export') {
    const { error } = await supabase.rpc('request_member_privacy_action', {
      target_request_type: action === 'request-deletion' ? 'account_deletion' : 'data_export',
      target_note: value(form, 'member_note'),
    });
    if (error) logPilotFailure('privacy_request_failed', error, { actor_profile_id: user.id, action });
    status = error ? 'privacy-action-failed' : action === 'request-deletion' ? 'deletion-requested' : 'export-requested';
  } else if (action === 'cancel-request') {
    const { error } = await supabase.rpc('cancel_my_privacy_request', {
      target_request_id: value(form, 'request_id'),
    });
    if (error) logPilotFailure('privacy_request_cancel_failed', error, { actor_profile_id: user.id, action });
    status = error ? 'privacy-action-failed' : 'privacy-request-cancelled';
  }

  return context.redirect(`/profiles/me?status=${status}`, 303);
};

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/profiles/me?status=preview-readonly', 303);
  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const { data, error } = await supabase.rpc('export_my_member_data');
  if (error || !data) {
    if (error) logPilotFailure('member_export_failed', error, { actor_profile_id: user.id, action: 'member_export' });
    return context.redirect('/profiles/me?status=export-failed', 303);
  }
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="commonwork-member-export.json"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
