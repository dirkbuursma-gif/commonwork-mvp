import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return new Response('Authentication is required.', { status: 401 });
  if (user.isLocalTestUser) return new Response('Preview identity is read-only.', { status: 403 });
  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Account controls are unavailable.', { status: 503 });
  // The export RPC derives identity from auth.uid(), never query parameters.
  const result = await client.rpc('export_my_member_data');
  if (result.error || !result.data) return new Response('Account export is unavailable.', { status: 503 });
  return new Response(JSON.stringify(result.data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="commonwork-account-export.json"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return new Response('Authentication is required.', { status: 401 });
  if (user.isLocalTestUser) return new Response('Preview identity is read-only.', { status: 403 });
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) {
    return new Response('Cross-origin account action rejected.', { status: 403 });
  }
  const form = await context.request.formData();
  const action = String(form.get('action') ?? '');
  const note = String(form.get('member_note') ?? '').trim();
  if (!['request-deletion', 'request-export', 'cancel-request'].includes(action) || note.length > 2000) {
    return new Response('Invalid account action.', { status: 400 });
  }
  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Account controls are unavailable.', { status: 503 });
  let status = 'action-failed';
  if (action === 'cancel-request') {
    const result = await client.rpc('cancel_my_privacy_request', { target_request_id: String(form.get('request_id') ?? '') });
    if (!result.error && result.data === true) status = 'request-cancelled';
  } else {
    // A new identity may need its own minimal private record for the privacy FK.
    // Ignore an existing row: never overwrite its profile, preferences or consent.
    const profile = await client.from('profiles').upsert(
      { id: user.id, display_name: 'Account holder', profile_visibility: 'private' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (profile.error) return context.redirect('/account?status=action-failed', 303);
    const result = await client.rpc('request_member_privacy_action', {
      target_request_type: action === 'request-deletion' ? 'account_deletion' : 'data_export', target_note: note,
    });
    if (!result.error && typeof result.data === 'string') status = action === 'request-deletion' ? 'deletion-requested' : 'export-requested';
  }
  return context.redirect(`/account?status=${status}`, 303);
};
