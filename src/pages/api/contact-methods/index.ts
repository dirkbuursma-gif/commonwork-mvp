import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { logPilotFailure } from '../../../lib/observability';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function redirect(context: Parameters<APIRoute>[0], status: string) {
  return context.redirect(`/profiles/me?status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return redirect(context, 'preview-readonly');

  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);
  const form = await context.request.formData();
  const action = value(form, 'action');

  if (action === 'delete') {
    const methodId = value(form, 'method_id');
    if (!methodId) return redirect(context, 'contact-method-invalid');
    const { error } = await supabase.rpc('delete_profile_contact_method', { target_method_id: methodId });
    if (error) logPilotFailure('contact_method_delete_failed', error, { actor_profile_id: user.id, action: 'contact_method_delete' });
    return redirect(context, error ? 'contact-method-failed' : 'contact-method-removed');
  }

  if (action !== 'save') return redirect(context, 'contact-method-invalid');
  const methodId = value(form, 'method_id') || null;
  const methodType = value(form, 'method_type');
  const methodValue = value(form, 'value');
  const label = value(form, 'label');
  const makePrimary = form.get('is_primary') === 'on';
  if (!['email', 'calendar_url'].includes(methodType) || !methodValue || label.length > 120) {
    return redirect(context, 'contact-method-invalid');
  }

  if (methodType === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(methodValue)) return redirect(context, 'contact-method-invalid');
  } else {
    try {
      const url = new URL(methodValue);
      if (url.protocol !== 'https:' || url.username || url.password || methodValue.length > 2048) {
        return redirect(context, 'contact-method-invalid');
      }
    } catch {
      return redirect(context, 'contact-method-invalid');
    }
  }

  const { error } = await supabase.rpc('save_profile_contact_method', {
    target_method_id: methodId,
    target_method_type: methodType,
    target_value: methodValue,
    target_label: label,
    make_primary: makePrimary,
  });
  if (error) logPilotFailure('contact_method_save_failed', error, { actor_profile_id: user.id, action: 'contact_method_save' });
  return redirect(context, error ? 'contact-method-failed' : 'contact-method-saved');
};