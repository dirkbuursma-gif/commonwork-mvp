import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { deliveryError, deliveryHeaders, readDeliveryConfiguration, streamEventObject } from '../../../lib/events/object-delivery';
import { describeDeliveryConfigurationFailure, describeStagingDeliveryBinding } from '../../../lib/events/configuration-diagnostics';

export const prerender = false;

// Preview-only configuration-presence preflight; never creates a Storage client or reads object bytes.
// It proves binding and credential shape, NOT successful privileged Storage access.
export const GET: APIRoute = () => {
  if (process.env.VERCEL_ENV !== 'preview') return deliveryError('Preview delivery preflight unavailable.', 404);
  try {
    const config = readDeliveryConfiguration();
    return new Response('Authentication and event approval required.', { status: 401, headers: {
      ...deliveryHeaders, 'Content-Type': 'text/plain; charset=utf-8',
      'X-Commonwork-Event-Delivery': 'server-stream-v1',
      'X-Commonwork-Delivery-Project': new URL(config.origin).hostname.split('.')[0],
    } });
  } catch {
    const input = {
      publicUrl: import.meta.env.PUBLIC_SUPABASE_URL,
      privateKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      development: Boolean(import.meta.env.DEV),
      server: typeof window === 'undefined',
    };
    const code = describeDeliveryConfigurationFailure(input);
    const binding = describeStagingDeliveryBinding(input);
    return deliveryError([
      `Configure server-only event delivery for this Preview. Diagnostic: ${code}.`,
      `Runtime URL matches staging: ${binding.urlMatchesStaging}`,
      `Runtime private-key project claim is present: ${binding.keyRefPresent}`,
      `Runtime private-key project claim matches staging: ${binding.keyRefMatchesStaging}`,
    ].join('\n'), 503);
  }
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return deliveryError('Authentication is required.', 401);
  if (user.isLocalTestUser) return deliveryError('Preview identity is read-only.', 403);
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) {
    return deliveryError('Cross-origin form submission rejected.', 403);
  }
  try {
    let form: FormData;
    try { form = await context.request.formData(); } catch { return deliveryError('Invalid material request.', 400); }
    const id = form.get('material_id');
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return deliveryError('A valid material reference is required.', 400);
    }
    const supabase = createSupabaseServerClient(context);
    if (!supabase) return deliveryError('Event materials are not configured.', 503);
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || !identity.user?.email_confirmed_at || identity.user.id !== user.id) return deliveryError('Verified authentication is required.', 401);
    const { data: material, error } = await supabase.from('event_materials').select('id, event_id, storage_path').eq('id', id).maybeSingle();
    if (error || !material) return deliveryError('This material is not available for your account.', 403);
    if (form.has('event_id') && form.get('event_id') !== material.event_id) return deliveryError('Event material not found.', 404);
    if (form.has('event_slug')) {
      const slug = form.get('event_slug');
      if (typeof slug !== 'string') return deliveryError('Event material not found.', 404);
      const match = await supabase.from('events').select('id').eq('id', material.event_id).eq('slug', slug).maybeSingle();
      if (match.error || !match.data) return deliveryError('Event material not found.', 404);
    }
    const access = await supabase.rpc('has_approved_event_access', { target_event_id: material.event_id });
    if (access.error || access.data !== true) return deliveryError('This material is not available for your account.', 403);
    return streamEventObject({ request: context.request, eventId: material.event_id, path: material.storage_path });
  } catch { return deliveryError('We could not load this material. Please try again shortly.', 503); }
};
