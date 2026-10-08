#!/usr/bin/env node
// LOCAL ONLY. Seeds a fictional pilot dataset (organisations, 20 members, needs,
// introductions and feedback) into a local Supabase stack. Refuses any other host.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const batch = 'commonwork-pilot-fictional-v1';
const emailDomain = 'pilot.example.test';

const organisations = [
  { slug: 'northwind-outfitters', name: 'Northwind Outfitters (fictional)', type: 'retailer', summary: 'Fictional mid-market fashion retailer.' },
  { slug: 'harbour-home', name: 'Harbour Home (fictional)', type: 'retailer', summary: 'Fictional home and garden retailer.' },
  { slug: 'alpine-grocers', name: 'Alpine Grocers (fictional)', type: 'retailer', summary: 'Fictional omnichannel grocer.' },
  { slug: 'civic-electronics', name: 'Civic Electronics (fictional)', type: 'retailer', summary: 'Fictional consumer-electronics retailer with a marketplace.' },
  { slug: 'demo-kibo', name: 'Kibo (demo affiliation)', type: 'vendor', provider: 'kibo', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  { slug: 'demo-salesforce', name: 'Salesforce (demo affiliation)', type: 'vendor', provider: 'salesforce', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  { slug: 'demo-catsy', name: 'Catsy (demo affiliation)', type: 'vendor', provider: 'catsy', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  { slug: 'demo-genesys', name: 'Genesys (demo affiliation)', type: 'vendor', provider: 'genesys', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  { slug: 'demo-begen', name: 'Begen (demo affiliation)', type: 'vendor', provider: 'begen', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  { slug: 'demo-benext', name: 'Benext (demo affiliation)', type: 'vendor', provider: 'benext', summary: 'Demo organisation linked to the catalogue provider. Members are fictional.' },
  {
    slug: 'meridian-commerce-partners', name: 'Meridian Commerce Partners (fictional)', type: 'si_gtm',
    summary: 'Fictional systems integrator for commerce replatforming and integration.',
    competencies: ['replatforming-strategy', 'commerce-platforms', 'systems-integration', 'composable-commerce', 'program-leadership'],
    products: ['kibo-commerce', 'salesforce-commerce-cloud', 'adobe-commerce'],
  },
  {
    slug: 'lattice-data-studio', name: 'Lattice Data Studio (fictional)', type: 'si_gtm',
    summary: 'Fictional product-data enrichment and PIM implementation partner.',
    competencies: ['product-data-enrichment', 'product-data-quality', 'product-information-management'],
    products: ['catsy-pim-dam', 'informatica-product-360'],
  },
  {
    slug: 'brightpath-service-design', name: 'Brightpath Service Design (fictional)', type: 'si_gtm',
    summary: 'Fictional service-automation implementation partner.',
    competencies: ['customer-experience', 'workflow-automation', 'human-centered-automation'],
    products: ['genesys-cloud', 'zendesk'],
  },
  {
    slug: 'orbit-gtm', name: 'Orbit GTM (fictional)', type: 'si_gtm',
    summary: 'Fictional go-to-market and partner-programme consultancy.',
    competencies: ['go-to-market-design', 'partner-development', 'partner-ecosystems'],
    products: [],
  },
  { slug: 'nilsson-advisory', name: 'Nilsson Advisory (fictional)', type: 'advisor', summary: 'Fictional independent vendor-selection advisor.' },
];

const people = [
  ['Maren Kessler', 'northwind-outfitters', 'Head of Digital Commerce', ['replatforming-strategy', 'platform-assessment', 'stakeholder-alignment']],
  ['Tomás Reyes', 'northwind-outfitters', 'Product Data Lead', ['product-data-quality', 'product-information-management', 'retail-operations']],
  ['Ilse van Dam', 'harbour-home', 'Director E-commerce', ['composable-commerce', 'program-leadership', 'vendor-evaluation']],
  ['Ravi Anand', 'harbour-home', 'CX Operations Manager', ['customer-experience', 'workflow-automation', 'retail-operations'], 'unavailable'],
  ['Sofia Lindqvist', 'alpine-grocers', 'Chief Digital Officer', ['agentic-commerce', 'ai-agent-governance', 'evidence-led-decision-making']],
  ['Jonas Weber', 'alpine-grocers', 'Marketplace Manager', ['marketplace-operations', 'retail-media', 'partner-ecosystems']],
  ['Priya Nair', 'civic-electronics', 'VP Commerce', ['commerce-architecture', 'enterprise-procurement', 'constructive-challenge']],
  ['Dmitri Volkov', 'civic-electronics', 'Service Director', ['customer-experience', 'human-centered-automation', 'workflow-automation']],
  ['Hannah Cole', 'demo-kibo', 'Solutions Architect', ['composable-commerce', 'commerce-platforms', 'commerce-architecture']],
  ['Marcus Obi', 'demo-salesforce', 'Commerce Solution Engineer', ['commerce-platforms', 'platform-assessment', 'systems-integration']],
  ['Elena Rossi', 'demo-catsy', 'Customer Success Lead', ['product-information-management', 'product-data-enrichment', 'product-data-quality']],
  ['Yusuf Demir', 'demo-genesys', 'Service Automation Specialist', ['customer-experience', 'workflow-automation', 'human-centered-automation']],
  ['Clara Hoffmann', 'demo-begen', 'Agent Governance Lead', ['ai-agent-governance', 'agentic-commerce', 'workflow-automation']],
  ['Mila Costa', 'demo-begen', 'Creative Automation Lead', ['workflow-automation', 'knowledge-sharing']],
  ['Noor Janssen', 'demo-benext', 'Visibility Analyst', ['evidence-led-decision-making', 'knowledge-sharing']],
  ['Daan Bakker', 'demo-benext', 'Content Strategy Lead', ['evidence-led-decision-making', 'stakeholder-alignment']],
  ['Anouk de Wit', 'meridian-commerce-partners', 'Principal Consultant', ['replatforming-strategy', 'commerce-platforms', 'program-leadership']],
  ['Kwame Mensah', 'meridian-commerce-partners', 'Integration Lead', ['systems-integration', 'commerce-architecture', 'composable-commerce']],
  ['Lena Fischer', 'lattice-data-studio', 'Data Practice Lead', ['product-data-enrichment', 'product-data-quality', 'product-information-management']],
  ['Samira Haddad', 'brightpath-service-design', 'Partner', ['customer-experience', 'workflow-automation', 'stakeholder-alignment']],
  ['Oliver Grant', 'orbit-gtm', 'GTM Strategist', ['go-to-market-design', 'partner-development', 'partner-ecosystems']],
  ['Greta Nilsson', 'nilsson-advisory', 'Independent Advisor', ['vendor-evaluation', 'enterprise-procurement', 'commercial-negotiation']],
  ['Commonwork Curator', null, 'Pilot curator and connector', ['platform-assessment', 'stakeholder-alignment', 'knowledge-sharing'], 'open', true],
];

const productAffiliations = [
  { member: 'Clara Hoffmann', product: 'admultify' },
  { member: 'Mila Costa', product: 'admultify' },
  { member: 'Noor Janssen', product: 'be-cited' },
  { member: 'Daan Bakker', product: 'be-cited' },
];

const needs = [
  {
    owner: 'Maren Kessler', organisation: 'northwind-outfitters', segment: 'Mid-market fashion',
    title: 'Replatform our storefront without losing conversion',
    outcome: 'Move to a platform that supports faster merchandising change within 12 months.',
    problem: 'Our current storefront is expensive to change and the platform choice is contested internally.',
    stack: 'Legacy monolithic storefront, separate PIM, bespoke ERP integration.',
    project: 'Discovery stage, board decision expected next quarter.',
    essential: ['replatforming-strategy', 'platform-assessment'], useful: ['vendor-evaluation', 'composable-commerce'],
    conversation: 'project',
  },
  {
    owner: 'Tomás Reyes', organisation: 'northwind-outfitters', segment: 'Mid-market fashion',
    title: 'Fix product data quality before channel expansion',
    outcome: 'Reach consistent, complete product data before launching on two new channels.',
    problem: 'Attribute completeness varies by supplier and enrichment is manual.',
    stack: 'Spreadsheet-based onboarding feeding a legacy PIM.',
    project: 'Budget approved, vendor not selected.',
    essential: ['product-data-quality', 'product-information-management'], useful: ['product-data-enrichment'],
    conversation: 'advisory',
  },
  {
    owner: 'Sofia Lindqvist', organisation: 'alpine-grocers', segment: 'Omnichannel grocery',
    title: 'Set governance for an agentic-commerce pilot',
    outcome: 'Run a bounded agent pilot with clear permissions and escalation.',
    problem: 'We lack a shared view of what agents may do on our behalf and who is accountable.',
    stack: 'Composable storefront, in-house search, third-party loyalty.',
    project: 'Pilot scoping.',
    essential: ['ai-agent-governance', 'agentic-commerce'], useful: ['commerce-architecture'],
    conversation: 'peer_exchange',
  },
  {
    owner: 'Dmitri Volkov', organisation: 'civic-electronics', segment: 'Consumer electronics marketplace',
    title: 'Automate service without losing escalation quality',
    outcome: 'Deflect routine contacts while keeping complex cases with trained agents.',
    problem: 'Contact volume spikes after launches and escalation rules are inconsistent.',
    stack: 'Legacy contact-centre suite plus email ticketing.',
    project: 'Evaluating options.',
    essential: ['workflow-automation', 'customer-experience'], useful: ['human-centered-automation'],
    conversation: 'advisory',
  },
  {
    owner: 'Priya Nair', organisation: 'civic-electronics', segment: 'Consumer electronics marketplace',
    title: 'Improve onsite search relevance',
    outcome: 'Raise search-to-purchase rate on long-tail electronics.',
    problem: 'Search ranking ignores availability and attribute quality.',
    stack: 'Platform-native search.',
    project: 'Early research. Deliberately no member holds this competence yet.',
    essential: ['product-discovery-optimization'], useful: [],
    conversation: 'advisory',
  },
];

const introductions = [
  { needOwner: 'Maren Kessler', recipient: 'Anouk de Wit', outcome: 'completed' },
  { needOwner: 'Tomás Reyes', recipient: 'Elena Rossi', outcome: 'introduced' },
  { needOwner: 'Sofia Lindqvist', recipient: 'Clara Hoffmann', outcome: 'pending' },
  { needOwner: 'Dmitri Volkov', recipient: 'Samira Haddad', outcome: 'declined' },
];

function ok(label, result) {
  if (result.error) throw new Error(`${label} failed: ${result.error.code ?? ''} ${result.error.message}`.trim());
  return result.data;
}

function localConfig() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { cwd: process.cwd(), encoding: 'utf8' });
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index < 1) continue;
    const raw = line.slice(index + 1).trim();
    values[line.slice(0, index).trim()] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  const { API_URL: url, ANON_KEY: anon, SERVICE_ROLE_KEY: service } = values;
  if (!url || !anon || !service) throw new Error('Local Supabase is not running. Run "npx supabase start" first.');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('Refusing to run: this script only targets a local Supabase stack.');
  }
  return { url, anon, service };
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

function emailFor(name) {
  return `${name.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@${emailDomain}`;
}

async function clear(admin) {
  const { data: org } = await admin.from('organisations').select('id').eq('seed_batch', batch);
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users.filter((user) => user.app_metadata?.pilot_seed_batch === batch));
    if (data.users.length < 100) break;
  }
  for (const user of users) ok('Delete seed user', await admin.auth.admin.deleteUser(user.id));
  ok('Delete seed organisations', await admin.from('organisations').delete().eq('seed_batch', batch));
  console.log(`Removed ${users.length} seed members and ${org?.length ?? 0} seed organisations.`);
}

async function seed(config) {
  const admin = createClient(config.url, config.service, clientOptions);
  if (process.env.PILOT_SEED_PASSWORD && process.env.PILOT_SEED_PASSWORD.length < 12) {
    throw new Error('PILOT_SEED_PASSWORD must be at least 12 characters.');
  }
  await clear(admin);

  const competencyRows = ok('Load competencies', await admin.from('competencies').select('id, slug').eq('status', 'active'));
  const competencyId = new Map(competencyRows.map((row) => [row.slug, row.id]));
  const needSlug = (slug) => {
    if (!competencyId.has(slug)) throw new Error(`Unknown competency ${slug}.`);
    return competencyId.get(slug);
  };
  const providers = ok('Load providers', await admin.from('providers').select('id, slug'));
  const products = ok('Load products', await admin.from('provider_products').select('id, slug'));
  if (providers.length === 0) throw new Error('Run "npx supabase db reset" first so the intelligence catalogue is seeded.');
  const providerId = new Map(providers.map((row) => [row.slug, row.id]));
  const productId = new Map(products.map((row) => [row.slug, row.id]));

  const orgId = new Map();
  for (const org of organisations) {
    const row = ok('Create organisation', await admin.from('organisations').insert({
      slug: org.slug, name: org.name, organisation_type: org.type, summary: org.summary,
      provider_id: org.provider ? providerId.get(org.provider) ?? null : null,
      is_seed_data: true, seed_batch: batch,
    }).select('id').single());
    orgId.set(org.slug, row.id);
    if (org.competencies?.length) {
      ok('Link organisation competencies', await admin.from('organisation_competency_links').insert(
        org.competencies.map((slug) => ({ organisation_id: row.id, competency_id: needSlug(slug), is_seed_data: true, seed_batch: batch })),
      ));
    }
    if (org.products?.length) {
      ok('Link organisation products', await admin.from('organisation_product_links').insert(
        org.products.map((slug) => {
          if (!productId.has(slug)) throw new Error(`Unknown product ${slug}.`);
          return { organisation_id: row.id, provider_product_id: productId.get(slug), is_seed_data: true, seed_batch: batch };
        }),
      ));
    }
  }

  const members = new Map();
  for (const [name, organisation, role, competencies, availability = 'selective', isConnector = false] of people) {
    const email = emailFor(name);
    const password = process.env.PILOT_SEED_PASSWORD || `${randomBytes(24).toString('base64url')}aA1!`;
    const created = ok('Create member', await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: { pilot_seed_batch: batch },
    })).user;
    const client = createClient(config.url, config.anon, clientOptions);
    ok('Sign in member', await client.auth.signInWithPassword({ email, password }));
    members.set(name, { id: created.id, email, client });

    ok('Create profile', await admin.from('profiles').insert({
      id: created.id, display_name: name,
      professional_summary: `${role}${organisation ? ` at ${organisations.find((o) => o.slug === organisation).name}` : ''}. Fictional pilot member.`,
      what_i_contribute: `Practical experience with ${competencies.map((slug) => slug.replaceAll('-', ' ')).join(', ')}.`,
      what_i_am_exploring: 'How to make trusted introductions more useful.',
      profile_visibility: 'members', onboarding_completed: true,
    }));
    const inserted = ok('Create competencies', await admin.from('profile_competencies').insert(
      competencies.map((slug) => ({
        profile_id: created.id, competency_id: needSlug(slug),
        member_statement: `Fictional pilot statement: applies ${slug.replaceAll('-', ' ')} to real-world commerce work.`,
        evidence_status: 'declared', discoverable: true,
      })),
    ).select('id'));
    ok('Create evidence', await admin.from('competence_evidence').insert(
      inserted.map((row, index) => ({
        profile_competency_id: row.id, title: `Pilot example ${index + 1}`,
        context: 'Fictional scenario created for pilot evaluation.',
        contribution: 'Compared options, documented assumptions and agreed a practical way forward.',
        outcome: 'The fictional team reached a clearer, actionable decision.',
        visibility: 'members',
      })),
    ));
    ok('Create contact preferences', await admin.from('contact_preferences').insert({
      profile_id: created.id, open_to_peer_exchange: true, open_to_advisory: true, open_to_projects: true,
      open_to_partnerships: true, availability_status: availability, conversation_capacity: availability === 'unavailable' ? 0 : 3,
    }));
    ok('Create contact method', await admin.from('profile_contact_methods').insert({
      profile_id: created.id, method_type: 'email', value: email, label: 'Fictional pilot inbox', is_primary: true,
    }));
    if (organisation) {
      ok('Link affiliation', await admin.from('profile_organisations').insert({
        profile_id: created.id, organisation_id: orgId.get(organisation), role_title: role,
        is_seed_data: true, seed_batch: batch,
      }));
    }
    for (const affiliation of productAffiliations.filter((item) => item.member === name)) {
      if (!productId.has(affiliation.product)) throw new Error(`Unknown product ${affiliation.product}.`);
      ok('Link product affiliation', await admin.from('profile_product_affiliations').insert({
        profile_id: created.id, provider_product_id: productId.get(affiliation.product), role_title: role,
        consent_given: true, consented_at: new Date().toISOString(), is_seed_data: true, seed_batch: batch,
      }));
    }
    if (isConnector) {
      ok('Create connector', await admin.from('connectors').insert({
        profile_id: created.id, status: 'active', introduction_capacity: 5, approved_at: new Date().toISOString(),
      }));
    }
  }

  const needIdByOwner = new Map();
  for (const need of needs) {
    const owner = members.get(need.owner);
    const row = ok('Create need', await owner.client.from('competence_needs').insert({
      owner_profile_id: owner.id, title: need.title, business_outcome: need.outcome,
      problem_statement: need.problem, relevant_context: 'Fictional pilot scenario.',
      what_requester_offers: 'Operational context and a candid account of what we have tried.',
      conversation_type: need.conversation, visibility: 'private_matches', status: 'draft',
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      retailer_organisation_id: orgId.get(need.organisation), retailer_segment: need.segment,
      current_stack_note: need.stack, project_context: need.project,
    }).select('id').single());
    ok('Add need competencies', await owner.client.from('need_competencies').insert([
      ...need.essential.map((slug) => ({ need_id: row.id, competency_id: needSlug(slug), importance: 'essential' })),
      ...need.useful.map((slug) => ({ need_id: row.id, competency_id: needSlug(slug), importance: 'useful' })),
    ]));
    ok('Activate need', await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', row.id));
    ok('Generate matches', await owner.client.rpc('generate_matches_for_need', { target_need_id: row.id }));
    needIdByOwner.set(need.owner, row.id);
  }

  for (const item of introductions) {
    const requester = members.get(item.needOwner);
    const recipient = members.get(item.recipient);
    const needId = needIdByOwner.get(item.needOwner);
    const match = ok('Find match', await requester.client.from('matches').select('id')
      .eq('need_id', needId).eq('matched_profile_id', recipient.id).maybeSingle());
    if (!match) throw new Error(`No match between ${item.needOwner} and ${item.recipient}.`);
    const requesterMethod = ok('Requester contact method', await requester.client.from('profile_contact_methods')
      .select('id').eq('profile_id', requester.id).eq('is_primary', true).single());
    const introductionId = ok('Request introduction', await requester.client.rpc('request_introduction', {
      target_match_id: match.id, target_route: 'direct',
      target_suggested_introducer_id: null, target_trusted_connector_id: null,
      target_why_this_person: 'Their experience relates directly to the problem we are solving.',
      target_why_now: 'We are making a decision in the coming weeks.',
      target_proposed_conversation: 'A 30-minute conversation to compare approaches and constraints.',
      target_requester_offer: 'I can share what we have learned so far.',
      target_contact_method_id: requesterMethod.id, target_intermediary_note: '',
    }));
    if (item.outcome === 'pending') continue;
    if (item.outcome === 'declined') {
      ok('Decline introduction', await recipient.client.rpc('recipient_introduction_response', {
        target_introduction_id: introductionId, target_action: 'decline_not_now',
      }));
      continue;
    }
    const recipientMethod = ok('Recipient contact method', await recipient.client.from('profile_contact_methods')
      .select('id').eq('profile_id', recipient.id).eq('is_primary', true).single());
    ok('Accept introduction', await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: introductionId, target_action: 'accept', target_contact_method_id: recipientMethod.id,
    }));
    if (item.outcome === 'completed') {
      for (const member of [requester, recipient]) {
        ok('Submit feedback', await member.client.rpc('submit_introduction_feedback', {
          target_introduction_id: introductionId, target_conversation_occurred: true, target_match_relevant: true,
          target_competencies_relevant: true, target_welcome_future: true,
          target_private_feedback: 'Fictional pilot feedback: useful and well prepared.',
        }));
      }
    }
  }

  console.log(`Seeded ${organisations.length} organisations, ${people.length} fictional members, ${needs.length} needs and ${introductions.length} introductions.`);
  console.log(`Members use addresses at ${emailDomain}. Set PILOT_SEED_PASSWORD (12+ characters) before seeding to sign in as a member locally; otherwise passwords are random.`);
  console.log('Clear with: node scripts/pilot-seed.mjs clear');
}

const command = process.argv[2];
if (!['seed', 'clear'].includes(command)) {
  console.error('Usage: node scripts/pilot-seed.mjs <seed|clear>');
  process.exit(2);
}
const config = localConfig();
if (command === 'clear') await clear(createClient(config.url, config.service, clientOptions));
else await seed(config);
