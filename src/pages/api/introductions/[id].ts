import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { logPilotFailure } from '../../../lib/observability';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function checked(form: FormData, key: string): boolean {
  return form.get(key) === 'on';
}

function optionalBoolean(raw: string): boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  const introductionId = context.params.id ?? '';
  if (user.isLocalTestUser) return context.redirect('/introductions?status=preview-readonly', 303);
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const action = value(form, 'action');
  let rpcError: unknown = null;

  if (action === 'accept') {
    ({ error: rpcError } = await supabase.rpc('recipient_introduction_response', {
      target_introduction_id: introductionId,
      target_action: 'accept',
      target_contact_method_id: value(form, 'contact_method_id'),
    }));
  } else if (['decline_not_relevant', 'decline_not_now', 'decline_no_capacity'].includes(action)) {
    const retryAfter = value(form, 'retry_after');
    ({ error: rpcError } = await supabase.rpc('recipient_introduction_response', {
      target_introduction_id: introductionId,
      target_action: action,
      target_retry_after: retryAfter || null,
    }));
  } else if (action === 'ask_context') {
    ({ error: rpcError } = await supabase.rpc('recipient_introduction_response', {
      target_introduction_id: introductionId,
      target_action: 'ask_context',
      target_context_question: value(form, 'context_question'),
    }));
  } else if (action === 'supply_context') {
    ({ error: rpcError } = await supabase.rpc('requester_introduction_context_response', {
      target_introduction_id: introductionId,
      target_context_response: value(form, 'context_response'),
    }));
  } else if (action === 'confirm_mutual' || action === 'make_introduction' || action === 'decline_facilitation' || action === 'insufficient_relevance') {
    ({ error: rpcError } = await supabase.rpc('connector_introduction_response', {
      target_introduction_id: introductionId,
      target_action: action,
    }));
  } else if (action === 'ask_connector_context') {
    ({ error: rpcError } = await supabase.rpc('connector_introduction_response', {
      target_introduction_id: introductionId,
      target_action: 'ask_context',
      target_context_question: value(form, 'context_question'),
    }));
  } else if (action === 'suggest_another_member') {
    ({ error: rpcError } = await supabase.rpc('connector_introduction_response', {
      target_introduction_id: introductionId,
      target_action: 'suggest_another_member',
      target_suggested_profile_id: value(form, 'suggested_profile_id'),
    }));
  } else if (action === 'accept_suggestion' || action === 'reject_suggestion') {
    ({ error: rpcError } = await supabase.rpc('requester_review_intermediary_suggestion', {
      target_introduction_id: introductionId,
      accept_suggestion: action === 'accept_suggestion',
    }));
  } else if (action === 'cancel') {
    ({ error: rpcError } = await supabase.rpc('cancel_introduction', {
      target_introduction_id: introductionId,
    }));
  } else if (action === 'feedback') {
    ({ error: rpcError } = await supabase.rpc('submit_introduction_feedback', {
      target_introduction_id: introductionId,
      target_conversation_occurred: checked(form, 'conversation_occurred'),
      target_match_relevant: optionalBoolean(value(form, 'match_relevant')),
      target_competencies_relevant: optionalBoolean(value(form, 'competencies_relevant')),
      target_welcome_future: optionalBoolean(value(form, 'would_welcome_future_introductions')),
      target_private_feedback: value(form, 'private_feedback'),
    }));
  } else if (action === 'report') {
    ({ error: rpcError } = await supabase.rpc('report_introduction', {
      target_introduction_id: introductionId,
      target_category: value(form, 'report_category'),
      target_details: value(form, 'report_details'),
    }));
  } else {
    return context.redirect(`/introductions/${introductionId}?status=action-unavailable`, 303);
  }

  if (rpcError) logPilotFailure('introduction_action_failed', rpcError, {
    actor_profile_id: user.id,
    introduction_id: introductionId,
    action,
  });
  return context.redirect(`/introductions/${introductionId}?status=${rpcError ? 'action-unavailable' : 'action-saved'}`, 303);
};