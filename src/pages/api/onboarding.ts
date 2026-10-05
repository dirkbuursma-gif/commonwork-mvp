import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';

const categories = new Set(['knowledge', 'practical_capability', 'way_of_working']);
const evidenceStatuses = new Set(['declared', 'demonstrated']);
const evidenceVisibilities = new Set(['private', 'matches_only', 'members']);
const availabilityStatuses = new Set(['open', 'selective', 'introductions_only', 'unavailable']);

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function failure(context: Parameters<APIRoute>[0], status: string, step: string) {
  return context.redirect(`/onboarding?step=${step}&status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return failure(context, 'preview-readonly', 'contribution');

  const requestOrigin = new URL(context.request.url).origin;
  const origin = context.request.headers.get('origin');
  if (origin && origin !== requestOrigin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const action = value(form, 'action');

  if (action === 'save-profile') {
    const displayName = value(form, 'display_name');
    const professionalSummary = value(form, 'professional_summary');
    const whatIContribute = value(form, 'what_i_contribute');
    const whatIAmExploring = value(form, 'what_i_am_exploring');
    const visibility = value(form, 'profile_visibility') || 'private';

    if (!displayName || !professionalSummary || !whatIContribute || !['private', 'members'].includes(visibility)) {
      return failure(context, 'invalid', 'contribution');
    }

    const profileFields = {
      display_name: displayName,
      professional_summary: professionalSummary,
      what_i_contribute: whatIContribute,
      what_i_am_exploring: whatIAmExploring,
      profile_visibility: visibility,
    };
    const { data: currentProfile, error: profileReadError } = await supabase.rpc('get_my_profile');
    if (profileReadError) return failure(context, 'save-failed', 'contribution');
    const hasProfile = Array.isArray(currentProfile) ? currentProfile.length > 0 : Boolean(currentProfile);
    const { error } = hasProfile
      ? await supabase.from('profiles').update(profileFields).eq('id', user.id)
      : await supabase.from('profiles').insert({ id: user.id, ...profileFields });

    return failure(context, error ? 'save-failed' : 'saved', error ? 'contribution' : 'competencies');
  }

  if (action === 'add-competency') {
    const competencyId = value(form, 'competency_id');
    const statement = value(form, 'member_statement');
    const evidenceStatus = value(form, 'evidence_status') || 'declared';

    if (!competencyId || !statement || !evidenceStatuses.has(evidenceStatus)) {
      return failure(context, 'invalid', 'competencies');
    }

    const { data: competency, error: lookupError } = await supabase
      .from('competencies')
      .select('id')
      .eq('id', competencyId)
      .eq('status', 'active')
      .maybeSingle();
    if (lookupError || !competency) return failure(context, 'invalid-competency', 'competencies');

    const { error } = await supabase.from('profile_competencies').insert({
      profile_id: user.id,
      competency_id: competency.id,
      member_statement: statement,
      evidence_status: evidenceStatus,
    });

    return failure(context, error ? 'competency-exists-or-save-failed' : 'competency-added', 'competencies');
  }

  if (action === 'remove-competency') {
    const profileCompetencyId = value(form, 'profile_competency_id');
    if (!profileCompetencyId) return failure(context, 'invalid', 'competencies');

    const { error } = await supabase
      .from('profile_competencies')
      .delete()
      .eq('id', profileCompetencyId)
      .eq('profile_id', user.id);

    return failure(context, error ? 'save-failed' : 'competency-removed', 'competencies');
  }

  if (action === 'suggest-competency') {
    const name = value(form, 'suggestion_name');
    const category = value(form, 'suggestion_category');
    const explanation = value(form, 'suggestion_explanation');
    if (!name || !categories.has(category) || !explanation) {
      return failure(context, 'invalid', 'competencies');
    }

    const { error } = await supabase.from('competency_suggestions').insert({
      profile_id: user.id,
      name,
      category,
      explanation,
    });
    return failure(context, error ? 'save-failed' : 'suggestion-saved', 'competencies');
  }

  if (action === 'add-evidence') {
    const profileCompetencyId = value(form, 'profile_competency_id');
    const title = value(form, 'title');
    const contextText = value(form, 'context');
    const contribution = value(form, 'contribution');
    const outcome = value(form, 'outcome');
    const rawUrl = value(form, 'evidence_url');
    const visibility = value(form, 'visibility') || 'matches_only';

    if (!profileCompetencyId || !title || !contextText || !contribution || !outcome || !evidenceVisibilities.has(visibility)) {
      return failure(context, 'invalid', 'evidence');
    }

    let evidenceUrl: string | null = null;
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
          return failure(context, 'invalid-url', 'evidence');
        }
        evidenceUrl = parsed.toString();
      } catch {
        return failure(context, 'invalid-url', 'evidence');
      }
    }

    const { error } = await supabase.from('competence_evidence').insert({
      profile_competency_id: profileCompetencyId,
      title,
      context: contextText,
      contribution,
      outcome,
      evidence_url: evidenceUrl,
      visibility,
    });
    if (error) return failure(context, 'save-failed', 'evidence');

    return failure(context, 'evidence-added', 'evidence');
  }

  if (action === 'remove-evidence') {
    const evidenceId = value(form, 'evidence_id');
    if (!evidenceId) return failure(context, 'invalid', 'evidence');

    const { error } = await supabase
      .from('competence_evidence')
      .delete()
      .eq('id', evidenceId);
    return failure(context, error ? 'save-failed' : 'evidence-removed', 'evidence');
  }

  if (action === 'save-preferences') {
    const availability = value(form, 'availability_status');
    const capacityRaw = value(form, 'conversation_capacity');
    const capacity = Number(capacityRaw);
    if (!availabilityStatuses.has(availability) || !Number.isInteger(capacity) || capacity < 0 || capacity > 100) {
      return failure(context, 'invalid', 'conversations');
    }

    const preferenceFields = {
      open_to_peer_exchange: form.get('open_to_peer_exchange') === 'on',
      open_to_advisory: form.get('open_to_advisory') === 'on',
      open_to_projects: form.get('open_to_projects') === 'on',
      open_to_partnerships: form.get('open_to_partnerships') === 'on',
      open_to_opportunities: form.get('open_to_opportunities') === 'on',
      open_to_event_introductions: form.get('open_to_event_introductions') === 'on',
      commercial_approaches: form.get('commercial_approaches') === 'on',
      availability_status: availability,
      conversation_capacity: capacity,
    };
    const { data: existingPreferences, error: preferenceReadError } = await supabase
      .from('contact_preferences')
      .select('profile_id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (preferenceReadError) return failure(context, 'save-failed', 'conversations');
    const { error } = existingPreferences
      ? await supabase.from('contact_preferences').update(preferenceFields).eq('profile_id', user.id)
      : await supabase.from('contact_preferences').insert({ profile_id: user.id, ...preferenceFields });

    if (error) return failure(context, 'save-failed', 'conversations');
    return context.redirect(`/profiles/${user.id}?status=preferences-saved`, 303);
  }

  return failure(context, 'invalid', 'contribution');
};
