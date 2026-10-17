import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

/**
 * Issues a short-lived signed URL for an attendee material.
 *
 * Authorisation is enforced twice and never by link possession:
 *   1. The member's own client reads event_materials under row level security.
 *   2. Storage itself refuses objects the member may not read.
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return new Response('Preview identity is read-only.', { status: 403 });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const form = await context.request.formData();
  const materialId = String(form.get('material_id') ?? '').trim();
  if (!materialId) return new Response('A material reference is required.', { status: 400 });

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Event materials are not configured.', { status: 503 });

  const { data: material, error } = await supabase
    .from('event_materials')
    .select('id, storage_path, title')
    .eq('id', materialId)
    .maybeSingle();

  // Row level security returns no row when the member is not an approved attendee.
  if (error || !material) {
    return new Response('This material is not available for your account.', { status: 403 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('event-materials')
    .createSignedUrl(material.storage_path, 300, { download: true });

  if (signError || !signed?.signedUrl) {
    return new Response('This material is not available for your account.', { status: 403 });
  }

  return context.redirect(signed.signedUrl, 303);
};
