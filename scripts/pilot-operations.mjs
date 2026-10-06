#!/usr/bin/env node
import { confirmAction, createAdminContext, fail } from './admin-context.mjs';

const args = process.argv.slice(2).filter((value) => value !== '--');
const [command, ...commandArgs] = args;
const flags = commandArgs.filter((value) => value.startsWith('--'));
const subjectId = commandArgs.find((value) => !value.startsWith('--'));
const noteFlagIndex = commandArgs.indexOf('--note');
const operatorNote = noteFlagIndex >= 0 ? commandArgs[noteFlagIndex + 1] ?? '' : '';
const commands = new Set([
  'report:list', 'report:view', 'report:review', 'report:resolve', 'report:dismiss',
  'privacy:list', 'privacy:view', 'privacy:review', 'privacy:resolve', 'privacy:reject',
]);
const identifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usage() {
  console.log('Usage: npm run report:list [--yes] [--confirm-production]');
  console.log('       npm run report:view -- <report-id> [--yes] [--confirm-production]');
  console.log('       npm run report:review|resolve|dismiss -- <report-id> --note <note> [--yes] [--confirm-production]');
  console.log('       npm run privacy:list [--yes] [--confirm-production]');
  console.log('       npm run privacy:view -- <request-id> [--yes] [--confirm-production]');
  console.log('       npm run privacy:review|resolve|reject -- <request-id> --note <note> [--yes] [--confirm-production]');
}

function printRows(rows) {
  for (const row of rows ?? []) console.log(Object.values(row).join('\t'));
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) return usage();
  if (!commands.has(command)) fail('Choose a report:list/view/review/resolve/dismiss or privacy:list/view/review/resolve/reject command.');

  const action = command.split(':')[1];
  const recordType = command.startsWith('report:') ? 'report' : 'privacy';
  const isList = action === 'list';
  if (!isList && !subjectId) fail('Provide the report or privacy request UUID.');
  if (!isList && !identifierPattern.test(subjectId)) fail('Provide a valid report or privacy request UUID.');
  if (['review', 'resolve', 'dismiss', 'reject'].includes(action)
    && (operatorNote.trim().length < 3 || operatorNote.trim().length > 2000)) {
    fail('Status changes require a --note between 3 and 2000 characters.');
  }

  const { admin, actorProfileId, environment } = await createAdminContext();
  await confirmAction(environment, command, subjectId ?? `all ${recordType}s`, flags);

  if (isList) {
    const rpc = recordType === 'report' ? 'list_commonwork_introduction_reports' : 'list_commonwork_privacy_requests';
    const { data, error } = await admin.rpc(rpc, { actor_profile_id: actorProfileId });
    if (error) fail(`Could not list ${recordType} records (${error.code ?? 'database_error'}).`);
    printRows(data);
    return;
  }

  if (action === 'view') {
    const rpc = recordType === 'report' ? 'get_commonwork_introduction_report' : 'get_commonwork_privacy_request';
    const parameter = recordType === 'report' ? 'target_report_id' : 'target_request_id';
    const { data, error } = await admin.rpc(rpc, {
      actor_profile_id: actorProfileId,
      [parameter]: subjectId,
    });
    if (error || !data) fail(`Could not view ${recordType} record (${error?.code ?? 'not_found'}).`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rpc = recordType === 'report' ? 'manage_commonwork_introduction_report' : 'manage_commonwork_privacy_request';
  const parameter = recordType === 'report' ? 'target_report_id' : 'target_request_id';
  const { data, error } = await admin.rpc(rpc, {
    actor_profile_id: actorProfileId,
    [parameter]: subjectId,
    target_action: action,
    target_note: operatorNote.trim(),
  });
  if (error || !data) fail(`The ${recordType} change was rejected (${error?.code ?? 'database_error'}).`);
  console.log(`${recordType} ${data.id} status=${data.status}`);
}

main().catch(() => fail('Pilot operations failed. No credentials or private report content were printed.'));