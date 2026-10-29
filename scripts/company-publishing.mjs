#!/usr/bin/env node
import { confirmAction, createAdminContext, fail } from './admin-context.mjs';

const args = process.argv.slice(2).filter((value) => value !== '--');
const [command, ...raw] = args;
const supported = new Set(['entitlement-grant', 'entitlement-revoke', 'entitlement-expire', 'writer-grant', 'writer-revoke', 'list']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOptions(values) {
  const positional = [];
  const flags = [];
  for (const value of values) {
    if (value.startsWith('--')) flags.push(value);
    else positional.push(value);
  }
  return { positional, flags };
}

async function resolveProvider(admin, slug) {
  if (!slugPattern.test(slug ?? '')) fail('Provide a valid company slug.');
  const { data, error } = await admin.from('providers').select('id, slug, name').eq('slug', slug).maybeSingle();
  if (error || !data) fail('No company was found for that slug.');
  return data;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: company-publishing entitlement-grant <company-slug> [--yes] [--confirm-production]');
    console.log('       company-publishing entitlement-revoke <company-slug> [--yes] [--confirm-production]');
    console.log('       company-publishing entitlement-expire <company-slug> [--yes] [--confirm-production]');
    console.log('       company-publishing writer-grant <profile-uuid> <company-slug> [product-slug] [--yes] [--confirm-production]');
    console.log('       company-publishing writer-revoke <profile-uuid> <company-slug> [product-slug] [--yes] [--confirm-production]');
    console.log('       company-publishing list <company-slug> [--yes] [--confirm-production]');
    console.log('Writer grants are distinct from administrator and product representative access. Entitlements in this release are complimentary only.');
    return;
  }
  if (!supported.has(command)) fail('Choose an entitlement grant/revoke/expire or writer grant/revoke command, or list.');
  const { admin, actorProfileId, environment } = await createAdminContext();
  const { positional, flags } = parseOptions(raw);

  if (command === 'list') {
    const [companySlug] = positional;
    const company = await resolveProvider(admin, companySlug);
    await confirmAction(environment, 'list', company.slug, flags);
    const [entitlement, assignments] = await Promise.all([
      admin.from('company_publishing_entitlements').select('id, entitlement_type, status, granted_at, review_due_at, ended_at').eq('provider_id', company.id).order('granted_at', { ascending: false }),
      admin.from('company_publishing_assignments').select('id, provider_product_id, profile_id, status, granted_at, revoked_at').eq('provider_id', company.id).order('granted_at', { ascending: false }),
    ]);
    if (entitlement.error || assignments.error) fail('Could not list company publishing access.');
    for (const row of entitlement.data ?? []) console.log(`entitlement\t${company.slug}\t${row.entitlement_type}\t${row.status}\t${row.id}\t${row.review_due_at ?? 'review date unset'}`);
    for (const row of assignments.data ?? []) console.log(`writer\t${company.slug}\t${row.profile_id}\t${row.provider_product_id ?? 'company'}\t${row.status}\t${row.id}`);
    return;
  }

  if (command.startsWith('entitlement-')) {
    const [companySlug] = positional;
    const company = await resolveProvider(admin, companySlug);
    const action = command.endsWith('-grant') ? 'grant' : command.endsWith('-expire') ? 'expire' : 'revoke';
    await confirmAction(environment, action, `complimentary founding pilot for ${company.slug}`, flags);
    const { data, error } = await admin.rpc('manage_company_publishing_entitlement', {
      target_provider_id: company.id,
      target_action: action,
      target_entitlement_type: 'complimentary_founding_pilot',
      actor_profile_id: actorProfileId,
    });
    if (error || !data) fail(`The entitlement change was rejected (${error?.code ?? 'database_error'}).`);
    console.log(`${action === 'grant' ? 'Granted' : action === 'expire' ? 'Expired' : 'Revoked'} complimentary founding-pilot publishing for ${company.slug}; entitlement=${data}.`);
    return;
  }

  const [profileId, companySlug, productSlug] = positional;
  if (!uuidPattern.test(profileId ?? '')) fail('Provide the writer profile UUID; names are not used to resolve accounts.');
  const company = await resolveProvider(admin, companySlug);
  let productId = null;
  if (productSlug) {
    if (!slugPattern.test(productSlug)) fail('Provide a valid product slug.');
    const { data: product, error } = await admin.from('provider_products')
      .select('id').eq('provider_id', company.id).eq('slug', productSlug).maybeSingle();
    if (error || !product) fail('No product in that company was found for the slug.');
    productId = product.id;
  }
  const action = command.endsWith('-grant') ? 'grant' : 'revoke';
  await confirmAction(environment, action, `writer ${profileId} for ${company.slug}${productSlug ? `/${productSlug}` : ''}`, flags);
  const { data, error } = await admin.rpc('manage_company_publisher_assignment', {
    target_provider_id: company.id,
    target_product_id: productId,
    target_profile_id: profileId,
    target_action: action,
    actor_profile_id: actorProfileId,
  });
  if (error || !data) fail(`The writer assignment was rejected (${error?.code ?? 'database_error'}).`);
  console.log(`${action === 'grant' ? 'Granted' : 'Revoked'} company publishing for ${profileId} at ${company.slug}${productSlug ? `/${productSlug}` : ''}; assignment=${data}.`);
}

main().catch(() => fail('Company publishing administration failed. No credentials or tokens were printed.'));