import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getAuthCallbackUrl } from '../../../lib/auth-callback-url';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const prerender = false;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json', Vary: 'Cookie' },
});

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function failure(error: { code?: string } | null) {
  const messages: Record<string, string> = {
    '22023': 'Review the required fields and company or member state.',
    '23505': 'A matching company or conflicting record already exists. Select it before creating another.',
    '42501': 'This operation requires administrator access and the relevant active membership, affiliation, or entitlement.',
  };
  return reply(400, { ok: false, message: messages[error?.code ?? ''] ?? 'The company operation could not be completed.' });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return reply(401, { ok: false, message: 'Authentication required.' });
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) {
    return reply(403, { ok: false, message: 'Cross-origin form submission rejected.' });
  }
  const client = createSupabaseServerClient(context);
  if (!client) return reply(503, { ok: false, message: 'Company administration is not configured.' });
  const { data: allowed, error: authorizationError } = await client.rpc('can_edit_insights');
  if (authorizationError || allowed !== true) return reply(403, { ok: false, message: 'Application administrator access required.' });

  const form = await context.request.formData();
  const action = value(form, 'action');
  if (action === 'search-member') {
    const { data, error } = await client.rpc('admin_search_company_member', { exact_email: value(form, 'email').toLowerCase() });
    if (error) return failure(error);
    return reply(200, { ok: true, found: Boolean(data), member: data ?? null });
  }

  if (action === 'save-company') {
    const providerId = value(form, 'provider_id') || null;
    const organisationId = value(form, 'organisation_id') || null;
    if ((providerId && !uuidPattern.test(providerId)) || (organisationId && !uuidPattern.test(organisationId))) {
      return reply(400, { ok: false, message: 'Select an existing company or organisation from the search results.' });
    }
    const { data, error } = await client.rpc('admin_save_company', {
      target_provider_id: providerId,
      target_organisation_id: organisationId,
      target_provider_slug: value(form, 'provider_slug'),
      target_provider_name: value(form, 'provider_name'),
      target_provider_type: value(form, 'provider_type'),
      target_website_url: value(form, 'website_url') || null,
      target_provider_summary: value(form, 'provider_summary'),
      target_source_system: value(form, 'source_system'),
      target_source_record_id: value(form, 'source_record_id'),
      target_source_url: value(form, 'source_url') || null,
      target_organisation_slug: value(form, 'organisation_slug'),
      target_organisation_type: value(form, 'organisation_type'),
      target_organisation_summary: value(form, 'organisation_summary'),
    });
    if (error || !data) return failure(error);
    return reply(200, { ok: true, companyId: data.provider_id, message: 'Company record saved as a draft.' });
  }

  const providerId = value(form, 'provider_id');
  if (!uuidPattern.test(providerId)) return reply(400, { ok: false, message: 'Select a company first.' });

  if (action === 'catalogue-status') {
    const { error } = await client.rpc('admin_set_company_catalogue_status', {
      target_provider_id: providerId,
      target_status: value(form, 'catalogue_status'),
      target_disclosure_note: value(form, 'disclosure_note'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Catalogue status updated.' });
  }

  if (action === 'invite-member') {
    const email = value(form, 'email').toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(400, { ok: false, message: 'Enter a valid email address.' });
    }

    const { data: prepared, error: prepareError } = await client.rpc('admin_prepare_company_invitation', {
      target_provider_id: providerId,
      exact_email: email,
    });
    if (prepareError) return failure(prepareError);
    const invitation = Array.isArray(prepared) ? prepared[0] as {
      invitation_id: string; invitation_status: string; delivery_status: string;
      auth_user_id: string | null; should_send: boolean;
    } | undefined : undefined;
    if (!invitation) return reply(500, { ok: false, message: 'The invitation could not be prepared.' });

    if (!invitation.should_send) {
      const message = invitation.invitation_status === 'existing_account'
        ? 'A confirmed account already exists. No email was sent; use Find account to connect the person separately.'
        : invitation.delivery_status === 'sent'
          ? 'This invitation is already pending. No duplicate email was sent.'
          : invitation.delivery_status === 'unknown'
            ? 'This invitation is pending, but email delivery could not be confirmed. No duplicate email was sent.'
            : invitation.delivery_status === 'sending'
              ? 'This invitation is already being processed. No duplicate email was sent.'
              : 'An unconfirmed account already exists. It remains pending; no invitation email was resent.';
      return reply(200, { ok: true, companyId: providerId, invitation, message });
    }

    const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      await client.rpc('admin_finish_company_invitation', {
        target_invitation_id: invitation.invitation_id,
        target_delivery_status: 'failed',
      });
      return reply(503, { ok: false, message: 'Server-side invitation delivery is not configured.' });
    }

    const redirectTo = getAuthCallbackUrl(context.request.url, {
      appBaseUrl: process.env.APP_BASE_URL,
      isDevelopment: import.meta.env.DEV,
    });
    if (!redirectTo) {
      await client.rpc('admin_finish_company_invitation', {
        target_invitation_id: invitation.invitation_id,
        target_delivery_status: 'failed',
      });
      return reply(503, { ok: false, message: 'The application callback URL is not configured safely.' });
    }
    const invitationRedirectTo = new URL(redirectTo);
    invitationRedirectTo.searchParams.set('invitation_id', invitation.invitation_id);

    const authAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let deliveryStatus: 'sent' | 'failed' | 'unknown' = 'sent';
    let invitedUserId: string | null = null;
    try {
      const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: invitationRedirectTo.toString() });
      if (error) {
        deliveryStatus = typeof error.status === 'number' && error.status < 500 ? 'failed' : 'unknown';
      } else {
        invitedUserId = data.user?.id ?? null;
      }
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
      deliveryStatus = typeof status === 'number' && status < 500 ? 'failed' : 'unknown';
    }

    const { error: finishError } = await client.rpc('admin_finish_company_invitation', {
      target_invitation_id: invitation.invitation_id,
      target_delivery_status: deliveryStatus,
      target_auth_user_id: invitedUserId,
    });
    if (finishError) {
      return reply(502, {
        ok: false,
        companyId: providerId,
        message: 'Invitation delivery may have completed, but its status could not be saved. Do not send a duplicate.',
      });
    }

    const message = deliveryStatus === 'sent'
      ? 'Invitation email sent. Accepting it confirms the account only; access and company permissions remain separate.'
      : deliveryStatus === 'failed'
        ? 'Auth did not accept the invite request. The invitation is marked failed and can be retried if no account was created.'
        : 'Email delivery could not be confirmed. The invitation remains pending and will not be resent automatically.';
    return reply(deliveryStatus === 'sent' ? 200 : 502, {
      ok: deliveryStatus === 'sent',
      companyId: providerId,
      invitation: { ...invitation, invitation_status: deliveryStatus === 'failed' ? 'failed' : 'pending', delivery_status: deliveryStatus },
      message,
    });
  }

  if (action === 'product-catalogue-status') {
    const productId = value(form, 'product_id');
    if (!uuidPattern.test(productId)) return reply(400, { ok: false, message: 'Select an existing product.' });
    const { error } = await client.rpc('admin_set_company_product_catalogue_status', {
      target_provider_id: providerId,
      target_product_id: productId,
      target_status: value(form, 'product_status'),
      target_disclosure_note: value(form, 'product_disclosure_note'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Product catalogue status updated.' });
  }

  if (action === 'save-membership') {
    const seatLimitType = value(form, 'seat_limit_type');
    const seatCount = seatLimitType === 'capped' ? Number(value(form, 'included_seats')) : null;
    if (seatLimitType === 'capped' && (!Number.isInteger(seatCount) || (seatCount ?? 0) < 1)) {
      return reply(400, { ok: false, message: 'Enter the included number of people, or choose an uncapped agreement.' });
    }
    const { error } = await client.rpc('admin_save_company_membership', {
      target_provider_id: providerId,
      target_status: value(form, 'membership_status'),
      target_commercial_status: value(form, 'commercial_status'),
      target_seat_limit_type: seatLimitType,
      target_included_seats: seatCount,
      target_seat_terms: value(form, 'seat_terms'),
      target_agreement_evidence_url: value(form, 'agreement_evidence_url') || null,
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Business membership saved.' });
  }

  if (action === 'publishing-entitlement') {
    const { error } = await client.rpc('admin_set_company_publishing_entitlement', {
      target_provider_id: providerId,
      target_action: value(form, 'entitlement_action'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Company publishing entitlement updated.' });
  }

  if (action === 'workspace-access') {
    const profileId = value(form, 'profile_id');
    if (!uuidPattern.test(profileId)) return reply(400, { ok: false, message: 'Select a confirmed existing account.' });
    const { error } = await client.rpc('admin_set_workspace_access', {
      target_profile_id: profileId,
      target_action: value(form, 'workspace_action'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Platform workspace access updated. Company affiliation and writer rights are unchanged.' });
  }

  if (action === 'connect-member') {
    const organisationId = value(form, 'organisation_id');
    if (!uuidPattern.test(organisationId)) return reply(400, { ok: false, message: 'Select this company’s organisation.' });
    const { error } = await client.rpc('admin_connect_company_member', {
      target_organisation_id: organisationId,
      exact_email: value(form, 'email').toLowerCase(),
      target_role_title: value(form, 'role_title'),
      target_is_primary: form.get('is_primary') === 'on',
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Existing confirmed account connected. Affiliation still requires approval.' });
  }

  if (action === 'affiliation') {
    const organisationId = value(form, 'organisation_id');
    const profileId = value(form, 'profile_id');
    if (!uuidPattern.test(organisationId) || !uuidPattern.test(profileId)) return reply(400, { ok: false, message: 'Select an existing member and company.' });
    const targetAction = value(form, 'verification_action');
    const { error } = await client.rpc('admin_set_company_affiliation', {
      target_organisation_id: organisationId,
      target_profile_id: profileId,
      target_action: targetAction,
      target_basis: value(form, 'verification_basis'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: targetAction === 'approve' ? 'Affiliation verified with basis and approver recorded.' : 'Affiliation verification removed.' });
  }

  if (action === 'writer') {
    const profileId = value(form, 'profile_id');
    const rawProductId = value(form, 'product_id');
    if (!uuidPattern.test(profileId) || (rawProductId && !uuidPattern.test(rawProductId))) {
      return reply(400, { ok: false, message: 'Select an existing member and, optionally, an existing product.' });
    }
    const { error } = await client.rpc('admin_set_company_writer', {
      target_provider_id: providerId,
      target_product_id: rawProductId || null,
      target_profile_id: profileId,
      target_action: value(form, 'writer_action'),
    });
    if (error) return failure(error);
    return reply(200, { ok: true, companyId: providerId, message: 'Writer scope updated. This does not grant administrator or representative rights.' });
  }

  return reply(400, { ok: false, message: 'Unsupported company administration action.' });
};

export const GET: APIRoute = () => new Response('Method not allowed.', {
  status: 405,
  headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' },
});