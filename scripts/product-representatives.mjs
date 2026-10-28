#!/usr/bin/env node
import { confirmAction, createAdminContext, fail, findUserId } from './admin-context.mjs';

const args = process.argv.slice(2).filter((value) => value !== '--');
const [command, ...commandArgs] = args;
const positional = commandArgs.filter((value) => !value.startsWith('--'));
const flags = commandArgs.filter((value) => value.startsWith('--'));
const supportedCommands = new Set(['grant', 'revoke', 'list']);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function resolveProduct(admin, slug) {
  if (!slugPattern.test(slug ?? '')) fail('Provide a valid product slug.');
  const { data, error } = await admin.from('provider_products').select('id, slug, name').eq('slug', slug).maybeSingle();
  if (error || !data) fail('No product was found for that slug.');
  return data;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run representative:grant -- <member-email> <product-slug> [--yes] [--confirm-production]');
    console.log('       npm run representative:revoke -- <member-email> <product-slug> [--yes] [--confirm-production]');
    console.log('       npm run representative:list [-- <product-slug>] [--yes] [--confirm-production]');
    console.log('A representative can read one private follower count for one product. It grants no editing, publishing, follower identities, exports or contact rights.');
    return;
  }
  if (!supportedCommands.has(command)) fail('Use representative:grant, representative:revoke or representative:list.');

  const { admin, actorProfileId, environment } = await createAdminContext();

  if (command === 'list') {
    const productSlug = positional[0];
    const product = productSlug ? await resolveProduct(admin, productSlug) : null;
    await confirmAction(environment, 'list', product ? product.slug : 'all product representatives', flags);
    const { data, error } = await admin.rpc('list_product_representatives', {
      actor_profile_id: actorProfileId,
      target_product_id: product ? product.id : null,
    });
    if (error) fail(`Could not list product representatives (${error.code ?? 'database_error'}: ${error.message}).`);
    for (const row of data ?? []) {
      console.log(`${row.assignment_id}\t${row.product_slug}\t${row.assigned_profile_id}\t${row.member_display_name}\t${row.assignment_status}`);
    }
    return;
  }

  const [targetEmail, productSlug] = positional;
  if (!targetEmail || !productSlug) fail('Provide the member email and the product slug.');
  const product = await resolveProduct(admin, productSlug);
  const targetProfileId = await findUserId(admin, targetEmail);
  await confirmAction(environment, command, `${targetEmail.trim().toLowerCase()} for ${product.slug}`, flags);

  const { data, error } = await admin.rpc('manage_product_representative', {
    target_product_id: product.id,
    target_profile_id: targetProfileId,
    target_action: command,
    actor_profile_id: actorProfileId,
  });
  if (error) fail(`The representative change was rejected (${error.code ?? 'database_error'}: ${error.message}).`);
  if (!data?.length) fail('The representative change was rejected (no assignment record returned).');
  console.log(`${command === 'grant' ? 'Granted' : 'Revoked'} follower-count access for ${product.slug}; status=${data[0].assignment_status}.`);
}

main().catch(() => fail('Product representative administration failed. No credentials or tokens were printed.'));
