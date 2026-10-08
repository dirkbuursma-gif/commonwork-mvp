#!/usr/bin/env node
import { confirmAction, createAdminContext, fail } from './admin-context.mjs';

const args = process.argv.slice(2).filter((value) => value !== '--');
const flags = args.filter((value) => value.startsWith('--'));
const tierFlag = args.find((value) => value.startsWith('--tier='))?.split('=')[1] ?? 'high';
const limitFlag = Number(args.find((value) => value.startsWith('--limit='))?.split('=')[1] ?? 25);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run signals:report [-- --tier=high|medium|low|all --limit=25] [--yes] [--confirm-production]');
  process.exit(0);
}
if (!['high', 'medium', 'low', 'all'].includes(tierFlag)) fail('--tier must be high, medium, low or all.');
if (!Number.isInteger(limitFlag) || limitFlag < 1 || limitFlag > 200) fail('--limit must be between 1 and 200.');

const { admin, environment } = await createAdminContext();
await confirmAction(environment, 'signals:report', 'member intent scores', flags);

let members = admin.from('member_intent_scores')
  .select('display_name, organisation_type, tier, total_score, fit_score, value_score, intent_score, distinct_views, needs_created, introductions_requested, last_activity_at')
  .order('total_score', { ascending: false })
  .limit(limitFlag);
if (tierFlag !== 'all') members = members.eq('tier', tierFlag);
const { data: memberRows, error: memberError } = await members;
if (memberError) fail(`Could not read member scores (${memberError.code ?? 'database_error'}).`);

const { data: organisationRows, error: organisationError } = await admin.from('organisation_intent_scores')
  .select('organisation_name, organisation_type, member_count, high_intent_members, top_member_score')
  .order('top_member_score', { ascending: false })
  .limit(limitFlag);
if (organisationError) fail(`Could not read organisation scores (${organisationError.code ?? 'database_error'}).`);

console.log(`Members (${tierFlag}) - internal use only`);
console.table(memberRows);
console.log('Organisations');
console.table(organisationRows);
