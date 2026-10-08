import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

const visibilities = new Set(['private_matches', 'network']);
const conversations = new Set(['peer_exchange', 'advisory', 'project', 'partnership', 'opportunity']);

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function values(form: FormData, key: string): string[] {
  return [...new Set(form.getAll(key).map(String).map((item) => item.trim()).filter(Boolean))];
}

function redirect(context: Parameters<APIRoute>[0], path: string, status?: string) {
  const target = new URL(path, context.request.url);
  if (status) target.searchParams.set('status', status);
  return context.redirect(target.pathname + target.search, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/find?status=preview-readonly', 303);

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const action = value(form, 'action');
  if (!['save-draft', 'activate'].includes(action)) return redirect(context, '/find', 'invalid');

  const needId = value(form, 'need_id');
  const title = value(form, 'title');
  const businessOutcome = value(form, 'business_outcome');
  const problemStatement = value(form, 'problem_statement');
  const relevantContext = value(form, 'relevant_context');
  const whatRequesterOffers = value(form, 'what_requester_offers');
  const conversationType = value(form, 'conversation_type') || 'peer_exchange';
  const visibility = value(form, 'visibility') || 'private_matches';
  const retailerOrganisationId = value(form, 'retailer_organisation_id');
  const retailerSegment = value(form, 'retailer_segment');
  const currentStackNote = value(form, 'current_stack_note');
  const projectContext = value(form, 'project_context');
  const expiresRaw = value(form, 'expires_at');
  const essentialIds = values(form, 'essential_competencies');
  const usefulIds = values(form, 'useful_competencies').filter((id) => !essentialIds.includes(id));

  if (!conversations.has(conversationType) || !visibilities.has(visibility)) {
    return redirect(context, '/find', 'invalid');
  }
  if (action === 'activate' && (
    title.length < 3 || businessOutcome.length < 3 || problemStatement.length < 3 ||
    essentialIds.length === 0 || !expiresRaw
  )) {
    return redirect(context, needId ? `/find/${needId}/edit` : '/find/new', 'incomplete');
  }

  let expiresAt: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.valueOf()) || parsed <= new Date()) {
      return redirect(context, needId ? `/find/${needId}/edit` : '/find/new', 'invalid-expiry');
    }
    expiresAt = parsed.toISOString();
  }

  if (action === 'activate' && essentialIds.length > 0) {
    const { data: validTerms, error: termsError } = await supabase
      .from('competencies')
      .select('id')
      .in('id', [...essentialIds, ...usefulIds])
      .eq('status', 'active');
    if (termsError || (validTerms?.length ?? 0) !== new Set([...essentialIds, ...usefulIds]).size) {
      return redirect(context, needId ? `/find/${needId}/edit` : '/find/new', 'invalid-competence');
    }
  }

  const fields = {
    title,
    business_outcome: businessOutcome,
    problem_statement: problemStatement,
    relevant_context: relevantContext,
    what_requester_offers: whatRequesterOffers,
    conversation_type: conversationType,
    visibility,
    expires_at: expiresAt,
    retailer_organisation_id: retailerOrganisationId || null,
    retailer_segment: retailerSegment.slice(0, 160),
    current_stack_note: currentStackNote.slice(0, 1500),
    project_context: projectContext.slice(0, 1500),
  };

  let savedNeedId = needId;
  if (needId) {
    const { data: existing, error: readError } = await supabase
      .from('competence_needs')
      .select('id, status')
      .eq('id', needId)
      .eq('owner_profile_id', user.id)
      .maybeSingle();
    if (readError || !existing || !['draft', 'paused', 'active'].includes(existing.status)) {
      return redirect(context, '/find', 'need-unavailable');
    }

    if (existing.status === 'active') {
      const { error: pauseError } = await supabase
        .from('competence_needs')
        .update({ status: 'paused' })
        .eq('id', needId)
        .eq('owner_profile_id', user.id);
      if (pauseError) return redirect(context, `/find/${needId}`, 'save-failed');
    }

    const { error: updateError } = await supabase
      .from('competence_needs')
      .update({ ...fields, status: 'draft' })
      .eq('id', needId)
      .eq('owner_profile_id', user.id);
    if (updateError) return redirect(context, `/find/${needId}/edit`, 'save-failed');

    const { error: deleteTermsError } = await supabase.from('need_competencies').delete().eq('need_id', needId);
    if (deleteTermsError) return redirect(context, `/find/${needId}/edit`, 'save-failed');
  } else {
    const { data: newNeed, error: insertError } = await supabase
      .from('competence_needs')
      .insert({ owner_profile_id: user.id, ...fields, status: 'draft' })
      .select('id')
      .single();
    if (insertError || !newNeed) return redirect(context, '/find/new', 'save-failed');
    savedNeedId = newNeed.id;
  }

  const needTerms = [
    ...essentialIds.map((competencyId) => ({
      need_id: savedNeedId,
      competency_id: competencyId,
      importance: 'essential' as const,
      context: value(form, `competence_context_${competencyId}`),
    })),
    ...usefulIds.map((competencyId) => ({
      need_id: savedNeedId,
      competency_id: competencyId,
      importance: 'useful' as const,
      context: value(form, `competence_context_${competencyId}`),
    })),
  ];
  if (needTerms.length > 0) {
    const { error: termInsertError } = await supabase.from('need_competencies').insert(needTerms);
    if (termInsertError) return redirect(context, `/find/${savedNeedId}/edit`, 'save-failed');
  }

  if (action === 'save-draft') return redirect(context, `/find/${savedNeedId}`, 'draft-saved');

  const { error: activateError } = await supabase
    .from('competence_needs')
    .update({ status: 'active' })
    .eq('id', savedNeedId)
    .eq('owner_profile_id', user.id);
  if (activateError) return redirect(context, `/find/${savedNeedId}/edit`, 'incomplete');

  const { error: matchingError } = await supabase.rpc('generate_matches_for_need', {
    target_need_id: savedNeedId,
  });
  if (matchingError) {
    await supabase.from('competence_needs').update({ status: 'paused' }).eq('id', savedNeedId).eq('owner_profile_id', user.id);
    return redirect(context, `/find/${savedNeedId}`, 'matching-unavailable');
  }

  return redirect(context, `/find/${savedNeedId}`, 'need-activated');
};
