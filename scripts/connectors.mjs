#!/usr/bin/env node
import { confirmAction, createAdminContext, fail, findUserId } from './admin-context.mjs';

const args = process.argv.slice(2).filter((value) => value !== '--');
const [command, ...commandArgs] = args;
const targetEmail = command === 'list' ? null : commandArgs.find((value) => !value.startsWith('--'));
const flags = commandArgs.filter((value) => value.startsWith('--'));
const commandMap = {
  add: 'assign',
  remove: 'revoke',
};
const supportedCommands = new Set(['add', 'remove', 'list']);

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run connector:add -- <email> [--capacity <1-100>] [--yes] [--confirm-production]');
    console.log('       npm run connector:list [--yes] [--confirm-production]');
    console.log('       npm run connector:remove -- <email> [--yes] [--confirm-production]');
    return;
  }
  if (!supportedCommands.has(command)) fail('Use connector:add, connector:list or connector:remove.');
  if (command !== 'list' && !targetEmail) fail('Provide the target member email.');

  const { admin, actorProfileId, environment } = await createAdminContext();

  if (command === 'list') {
    await confirmAction(environment, 'list', 'all connectors', flags);
    const { data, error } = await admin.rpc('list_commonwork_connectors', {
      actor_profile_id: actorProfileId,
    });
    if (error) fail(`Could not list Connector assignments (${error.code ?? 'database_error'}: ${error.message}).`);
    for (const connector of data ?? []) {
      console.log(`${connector.profile_id}\t${connector.display_name}\t${connector.status}\tcapacity=${connector.introduction_capacity}`);
    }
    return;
  }

  const targetProfileId = await findUserId(admin, targetEmail);
  const action = commandMap[command];
  const capacityFlag = commandArgs.indexOf('--capacity');
  const capacity = capacityFlag >= 0 ? Number(commandArgs[capacityFlag + 1]) : 2;
  if (action === 'assign' && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)) {
    fail('Capacity must be an integer between 1 and 100.');
  }
  await confirmAction(environment, command, targetEmail.trim().toLowerCase(), flags);

  const { data, error } = await admin.rpc('manage_commonwork_connector', {
    target_profile_id: targetProfileId,
    target_action: action,
    target_introduction_capacity: action === 'assign' ? capacity : null,
    actor_profile_id: actorProfileId,
  });
  if (error) fail(`The Connector change was rejected (${error.code ?? 'database_error'}: ${error.message}).`);
  if (!data?.length) fail('The Connector change was rejected (no Connector record returned).');
  const connector = data[0];
  console.log(`${command === 'add' ? 'Assigned' : 'Revoked'} Connector ${connector.display_name}; status=${connector.status}; capacity=${connector.introduction_capacity}.`);
}

main().catch(() => fail('Connector administration failed. No credentials or tokens were printed.'));
