import { expect, test } from '@playwright/test';
import {
  findCompetenceSuggestions,
  type CompetenceOption,
} from '../src/lib/cv-suggestions';
import { COUNTRY_CODES, isCountryCode, isValidMarketsServed } from '../src/lib/country-codes';
import { createDocx, createPdf } from './helpers/cv-fixtures';
import { createLocalMember } from './helpers/local-supabase';

const competencies: CompetenceOption[] = [
  { id: 'customer-experience', name: 'Customer experience', slug: 'customer-experience', category: 'knowledge', description: '' },
  { id: 'workflow-automation', name: 'Workflow automation', slug: 'workflow-automation', category: 'practical_capability', description: '' },
  { id: 'human-centered-automation', name: 'Human-centered automation', slug: 'human-centered-automation', category: 'way_of_working', description: '' },
  { id: 'partner-ecosystems', name: 'Partner ecosystems', slug: 'partner-ecosystems', category: 'knowledge', description: '' },
  { id: 'partner-development', name: 'Partner development', slug: 'partner-development', category: 'practical_capability', description: '' },
  { id: 'commercial-negotiation', name: 'Commercial negotiation', slug: 'commercial-negotiation', category: 'practical_capability', description: '' },
  { id: 'vendor-evaluation', name: 'Vendor evaluation', slug: 'vendor-evaluation', category: 'practical_capability', description: '' },
  { id: 'program-leadership', name: 'Program leadership', slug: 'program-leadership', category: 'practical_capability', description: '' },
  { id: 'product-information-management', name: 'Product information management', slug: 'product-information-management', category: 'knowledge', description: '' },
  { id: 'product-data-quality', name: 'Product-data quality', slug: 'product-data-quality', category: 'knowledge', description: '' },
  { id: 'marketplace-operations', name: 'Marketplace operations', slug: 'marketplace-operations', category: 'practical_capability', description: '' },
  { id: 'retail-operations', name: 'Retail operations', slug: 'retail-operations', category: 'knowledge', description: '' },
  { id: 'systems-integration', name: 'Systems integration', slug: 'systems-integration', category: 'practical_capability', description: '' },
  { id: 'cross-functional-collaboration', name: 'Cross-functional collaboration', slug: 'cross-functional-collaboration', category: 'way_of_working', description: '' },
  { id: 'evidence-led-decision-making', name: 'Evidence-led decision-making', slug: 'evidence-led-decision-making', category: 'way_of_working', description: '' },
  { id: 'contact-centre-automation-impact-evaluation', name: 'Contact-centre automation impact evaluation', slug: 'contact-centre-automation-impact-evaluation', category: 'practical_capability', description: '' },
  { id: 'staffing-capacity-planning', name: 'Staffing-capacity planning', slug: 'staffing-capacity-planning', category: 'practical_capability', description: '' },
  { id: 'event-coordination', name: 'Event coordination', slug: 'event-coordination', category: 'practical_capability', description: '' },
];

const syntheticCases = [
  {
    name: 'Contact-centre automation and workforce analysis',
    text: 'I led contact centre automation impact evaluation using workflow automation and human-in-the-loop automation with exception handling. My work included FTE analysis and staffing capacity planning.',
    expected: ['customer-experience', 'workflow-automation', 'human-centered-automation', 'contact-centre-automation-impact-evaluation', 'staffing-capacity-planning'],
    unmappedStandalonePhrases: ['FTE analysis'],
  },
  {
    name: 'Commercial partnerships',
    text: 'I supported business development, built partner ecosystems and led commercial negotiations after structured vendor evaluation.',
    expected: ['partner-development', 'partner-ecosystems', 'commercial-negotiation', 'vendor-evaluation'],
    unmappedStandalonePhrases: [],
  },
  {
    name: 'Event coordination',
    text: 'As program lead, I coordinated event coordination, event logistics, speaker schedules and conference delivery with venue teams.',
    expected: ['program-leadership', 'event-coordination'],
    unmappedStandalonePhrases: [],
  },
  {
    name: 'Product and retail operations',
    text: 'I improved product information management and product data quality for retail operations and marketplace operations.',
    expected: ['product-information-management', 'product-data-quality', 'retail-operations', 'marketplace-operations'],
    unmappedStandalonePhrases: [],
  },
  {
    name: 'Systems integration',
    text: 'I delivered systems integration and cross-functional collaboration, using evidence-led decision-making to improve workflow automation.',
    expected: ['systems-integration', 'cross-functional-collaboration', 'evidence-led-decision-making', 'workflow-automation'],
    unmappedStandalonePhrases: [],
  },
] as const;

test('five synthetic CV scenarios produce only reviewed vocabulary matches with accurate source context', () => {
  const misses: string[] = [];
  const falsePositives: string[] = [];
  let relevantSuggestions = 0;
  const unmappedStandalonePhrases: string[] = [];

  for (const scenario of syntheticCases) {
    const result = findCompetenceSuggestions(scenario.text, competencies);
    const actual = result.suggestions.map(({ competence }) => competence.slug);
    const expected = [...scenario.expected];
    relevantSuggestions += actual.filter((slug) => expected.includes(slug as typeof expected[number])).length;

    for (const slug of expected) {
      if (!actual.includes(slug)) misses.push(`${scenario.name}: ${slug}`);
    }
    for (const slug of actual) {
      if (!expected.includes(slug as typeof expected[number])) falsePositives.push(`${scenario.name}: ${slug}`);
    }
    for (const suggestion of result.suggestions) {
      expect(suggestion.sourceExcerpt.toLocaleLowerCase()).toContain(suggestion.matchedPhrase.toLocaleLowerCase());
      expect(scenario.text.toLocaleLowerCase()).toContain(suggestion.matchedPhrase.toLocaleLowerCase());
    }
    unmappedStandalonePhrases.push(...scenario.unmappedStandalonePhrases.map((term) => `${scenario.name}: ${term}`));
  }

  expect({ relevantSuggestions, misses, falsePositives, unmappedStandalonePhrases }).toEqual({
    relevantSuggestions: 19,
    misses: [],
    falsePositives: [],
    unmappedStandalonePhrases: [
      'Contact-centre automation and workforce analysis: FTE analysis',
    ],
  });

  expect(findCompetenceSuggestions('FTE analysis', competencies).suggestions)
    .not.toContainEqual(expect.objectContaining({
      competence: expect.objectContaining({ slug: 'contact-centre-automation-impact-evaluation' }),
    }));
  expect(findCompetenceSuggestions(
    'Contact centre automation impact evaluation included FTE analysis.',
    competencies,
  ).suggestions.map(({ competence }) => competence.slug))
    .toContain('contact-centre-automation-impact-evaluation');

  const unrelated = findCompetenceSuggestions(
    'I enjoy cooking, travelling and exploring new opportunities.',
    competencies,
  );
  expect(unrelated.suggestions).toEqual([]);
});

test('new vocabulary synonyms stay conservative and skip negated or aspirational statements', () => {
  const result = findCompetenceSuggestions(
    'I have no experience in staffing capacity planning. I am interested in event coordination. I am not skilled in contact-centre automation impact evaluation.',
    competencies,
  );
  const suggestedSlugs = result.suggestions.map(({ competence }) => competence.slug);
  expect(suggestedSlugs).not.toContain('staffing-capacity-planning');
  expect(suggestedSlugs).not.toContain('event-coordination');
  expect(suggestedSlugs).not.toContain('contact-centre-automation-impact-evaluation');

  const positive = findCompetenceSuggestions(
    'I completed workforce capacity planning and conference coordination for regional teams.',
    competencies,
  );
  expect(positive.suggestions.map(({ competence }) => competence.slug)).toEqual([
    'staffing-capacity-planning',
    'event-coordination',
  ]);
});

test('country validation uses a bounded unique uppercase ISO alpha-2 list', () => {
  expect(COUNTRY_CODES).toHaveLength(249);
  expect(new Set(COUNTRY_CODES).size).toBe(249);
  expect(isCountryCode('NL')).toBe(true);
  expect(isCountryCode('nl')).toBe(false);
  expect(isCountryCode('ZZ')).toBe(false);
  expect(isValidMarketsServed(['NL', 'BE'])).toBe(true);
  expect(isValidMarketsServed(['NL', 'NL'])).toBe(false);
  expect(isValidMarketsServed(['NL', 'nl'])).toBe(false);
  expect(isValidMarketsServed(Array.from({ length: 21 }, () => 'NL'))).toBe(false);
});

test('duplicate profile competencies are skipped rather than re-added', () => {
  const result = findCompetenceSuggestions(
    'I work in customer service with product data quality and marketplace operations.',
    competencies,
    new Set(['product-data-quality']),
  );
  expect(result.suggestions.map(({ competence }) => competence.slug)).toEqual([
    'customer-experience',
    'marketplace-operations',
  ]);
  expect(result.duplicateCount).toBe(1);
});

test('synthetic DOCX extraction stays local until a member explicitly saves a reviewed match', async ({ browser }) => {
  const member = await createLocalMember('Synthetic CV Test');
  const { error: profileError } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: 'Synthetic CV Test',
  });
  expect(profileError).toBeNull();
  const existingCompetence = await member.client.from('competencies')
    .select('id')
    .eq('slug', 'customer-experience')
    .single();
  const { error: existingCompetenceError } = await member.client.from('profile_competencies').insert({
    profile_id: member.id,
    competency_id: existingCompetence.data!.id,
    member_statement: 'I support customer service teams.',
  });
  expect(existingCompetenceError).toBeNull();

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const externalRequests: Array<{
    url: string;
    method: string;
    resourceType: string;
    postData: string | null;
  }> = [];
  const cvContentInLogs: string[] = [];
  const profileWrites: string[] = [];
  const workerDiagnostics: string[] = [];
  const page = await context.newPage();
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    await page.addInitScript(() => {
      const phases: string[] = [];
      Object.assign(window, { __cvPhases: phases });
      document.addEventListener('cv-import-phase', (event) => {
        phases.push((event as CustomEvent<string>).detail);
      });
    });
    page.on('worker', (worker) => {
      workerDiagnostics.push(`worker created: ${new URL(worker.url()).pathname}`);
      worker.on('close', () => workerDiagnostics.push('worker closed'));
    });
    page.on('pageerror', (error) => workerDiagnostics.push(`page error: ${error.name}: ${error.stack}`));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) workerDiagnostics.push(`navigation: ${new URL(frame.url()).pathname}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') workerDiagnostics.push(`console error: ${new URL(message.location().url || 'http://localhost').pathname}`);
    });
    await page.route('https://**/*', (route) => route.abort());
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          postData: request.postData(),
        });
      }
    });
    page.on('console', (message) => {
      if (/Synthetic source marker|FTE analysis|contact centre automation/i.test(message.text())) {
        cvContentInLogs.push(message.text());
      }
    });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        ['POST', 'PUT', 'PATCH'].includes(request.method()) &&
        (/\/api\/onboarding$/.test(url.pathname) ||
          /\/rest\/v1\/(profiles|profile_competencies|competency_suggestions|competence_evidence)/.test(url.pathname))
      ) {
        profileWrites.push(request.postData() ?? '');
      }
    });
    await page.goto('/onboarding?step=competencies');
    await expect(page.getByRole('heading', { name: 'Find possible matches in a CV' })).toBeVisible();
    const vocabulary = await page.locator('[data-cv-import]').evaluate((element) => JSON.parse(element.getAttribute('data-competencies') ?? '[]') as CompetenceOption[]);
    expect(vocabulary.map(({ slug }) => slug)).toContain('workflow-automation');
    expect(await page.locator('[data-cv-import]').getAttribute('data-existing-slugs')).toContain('customer-experience');

    const cvText = 'Synthetic source marker: contact centre automation, workflow automation and human-in-the-loop automation. FTE analysis was also part of this synthetic case.';
    await page.getByLabel('Choose a DOCX or searchable PDF').setInputFiles({
      name: 'synthetic-contact-centre.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createDocx(cvText),
    });
    try {
      await expect(page.getByRole('status')).toContainText('2 possible matches found', { timeout: 25_000 });
    } catch (error) {
      const phases = await page.evaluate(() =>
        (window as Window & { __cvPhases?: string[] }).__cvPhases ?? [],
      );
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nCV import events: ${[...workerDiagnostics, ...phases].join(' → ')}`);
    }
    const phaseTimeline = await page.evaluate(() =>
      (window as Window & { __cvPhases?: string[] }).__cvPhases ?? [],
    );
    const expectedPhases = [
      'selected',
      'worker-starting',
      'file-read',
      'worker-ready',
      'buffer-transferred',
      'extracting',
      'extraction-complete',
      'suggestions-calculated',
      'ui-updated',
      'complete',
    ];
    let lastPhaseIndex = -1;
    for (const phase of expectedPhases) {
      const phaseIndex = phaseTimeline.indexOf(phase, lastPhaseIndex + 1);
      expect(phaseIndex, `CV import phase timeline: ${phaseTimeline.join(' → ')}`).toBeGreaterThan(lastPhaseIndex);
      lastPhaseIndex = phaseIndex;
    }
    await expect(page.getByRole('status')).toContainText('1 match was already on your profile and skipped');
    await expect(page.locator('[data-cv-list]').getByRole('heading', { name: 'Customer experience' })).toHaveCount(0);
    await page.locator('[data-cv-list] summary').first().click();
    await expect(page.getByText('Synthetic source marker', { exact: false })).toBeVisible();
    await expect(page.locator('#cv-import-file')).toHaveValue('');

    expect(profileWrites).toEqual([]);
    const { data: unsavedCompetencies } = await member.client
      .from('profile_competencies')
      .select('id')
      .eq('profile_id', member.id);
    expect(unsavedCompetencies).toHaveLength(1);
    const storageContent = await page.evaluate(() => [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
    ].join('\n'));
    expect(storageContent).not.toContain('Synthetic source marker');

    await page.locator('[data-cv-list] li')
      .filter({ has: page.getByRole('heading', { name: 'Human-centered automation' }) })
      .getByRole('button', { name: 'Dismiss Human-centered automation match' })
      .click();
    await expect(page.locator('[data-cv-list]').getByRole('heading', { name: 'Human-centered automation' })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Dismissed. This choice is not saved.');

    const workflowAutomation = await member.client.from('competencies')
      .select('id')
      .eq('slug', 'workflow-automation')
      .single();
    await page.locator('[data-cv-list] li')
      .filter({ has: page.getByRole('heading', { name: 'Workflow automation' }) })
      .getByRole('button', { name: 'Use this match' })
      .click();
    await expect(page.locator('#competency-id')).toHaveValue(workflowAutomation.data!.id);
    await expect(page.getByText('contact centre automation', { exact: false })).toHaveCount(0);
    await expect(page.getByLabel('How do you apply this?')).toBeFocused();
    await page.getByLabel('How do you apply this?').fill('I improve customer-service workflows and review automation boundaries.');
    await page.getByRole('button', { name: 'Add competence' }).click();
    await expect(page.getByText('Competence added to your profile.')).toBeVisible();
    expect(profileWrites).toHaveLength(1);
    expect(profileWrites[0]).not.toContain('Synthetic source marker');
    expect(profileWrites[0]).not.toContain('FTE analysis');
    expect(externalRequests.every(({ method, resourceType }) => (
      method === 'GET' && ['stylesheet', 'font'].includes(resourceType)
    ))).toBe(true);
    expect(externalRequests.some(({ url, postData }) => (
      /Synthetic source marker|FTE analysis|contact centre automation/i.test(`${url}\n${postData ?? ''}`)
    ))).toBe(false);
    expect(cvContentInLogs).toEqual([]);

    const { data: savedCompetencies } = await member.client
      .from('profile_competencies')
      .select('competencies!inner(slug)')
      .eq('profile_id', member.id);
    expect(savedCompetencies?.flatMap((row) => {
      const relation = Array.isArray(row.competencies) ? row.competencies : [row.competencies];
      return relation.map(({ slug }) => slug);
    }).sort()).toEqual([
      'customer-experience',
      'workflow-automation',
    ]);
    const { data: savedEvidence } = await member.client
      .from('competence_evidence')
      .select('id');
    expect(savedEvidence).toEqual([]);
    const { data: savedSuggestions } = await member.client
      .from('competency_suggestions')
      .select('id')
      .eq('profile_id', member.id);
    expect(savedSuggestions).toEqual([]);
  } finally {
    await context.close();
    await member.remove();
  }
});

test('limits and unsupported document types retain the manual onboarding path', async ({ browser }) => {
  const member = await createLocalMember('Synthetic CV Limits');
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: 'Synthetic CV Limits',
  });
  expect(error).toBeNull();

  const context = await browser.newContext();
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    const fileInput = page.getByLabel('Choose a DOCX or searchable PDF');
    await page.goto('/onboarding?step=competencies');

    await fileInput.setInputFiles({
      name: 'oversized.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByRole('status')).toContainText('larger than 5 MB');

    await fileInput.setInputFiles({
      name: 'unsupported.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Manual onboarding remains available.'),
    });
    await expect(page.getByRole('status')).toContainText('Choose a DOCX or PDF file');
    await expect(page.getByLabel('Shared competence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add competence' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to evidence' })).toHaveCount(0);
  } finally {
    await context.close();
    await member.remove();
  }
});

test('PDF page and character limits, scanned files and encrypted DOCX fail clearly', async ({ browser }) => {
  const member = await createLocalMember('Synthetic CV Parser Limits');
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: 'Synthetic CV Parser Limits',
  });
  expect(error).toBeNull();

  const context = await browser.newContext();
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    const fileInput = page.getByLabel('Choose a DOCX or searchable PDF');
    await page.goto('/onboarding?step=competencies');

    await fileInput.setInputFiles({
      name: 'too-many-pages.pdf',
      mimeType: 'application/pdf',
      buffer: createPdf(Array.from({ length: 11 }, (_, index) => `Synthetic page ${index + 1}`)),
    });
    await expect(page.getByRole('status')).toContainText('more than 10 pages');

    await fileInput.setInputFiles({
      name: 'too-long.pdf',
      mimeType: 'application/pdf',
      buffer: createPdf(['X'.repeat(50_001)]),
    });
    await expect(page.getByRole('status')).toContainText('exceeds 50,000 characters');

    await fileInput.setInputFiles({
      name: 'scanned.pdf',
      mimeType: 'application/pdf',
      buffer: createPdf(['']),
    });
    await expect(page.getByRole('status')).toContainText('No searchable text was found');

    await fileInput.setInputFiles({
      name: 'encrypted.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createDocx('Synthetic password-protected document', true),
    });
    await expect(page.getByRole('status')).toContainText('Password-protected documents are not supported');
  } finally {
    await context.close();
    await member.remove();
  }
});

test('cancelling PDF extraction clears the file and aborts the local parser', async ({ browser }) => {
  const member = await createLocalMember('Synthetic CV PDF Cancellation');
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: 'Synthetic CV PDF Cancellation',
  });
  expect(error).toBeNull();

  const context = await browser.newContext();
  let releasePdfWorker = () => {};
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    await page.goto('/onboarding?step=competencies');
    await page.route(/pdf\.worker\.min\.mjs/, async (route) => {
      await new Promise<void>((resolve) => {
        releasePdfWorker = resolve;
      });
      await route.continue();
    });
    const pdfWorkerRequest = page.waitForRequest((request) => {
      return request.url().includes('pdf.worker.min.mjs');
    });
    await page.getByLabel('Choose a DOCX or searchable PDF').setInputFiles({
      name: 'synthetic-cancel.pdf',
      mimeType: 'application/pdf',
      buffer: createPdf(['Synthetic cancellation marker']),
    });
    await pdfWorkerRequest;
    await page.getByRole('button', { name: 'Cancel import' }).click();
    await expect(page.getByRole('status')).toHaveText('Import cancelled. Transient CV content was cleared.');
    await expect(page.locator('#cv-import-file')).toHaveValue('');
    releasePdfWorker();
    await expect(page.getByRole('status')).toHaveText('Import cancelled. Transient CV content was cleared.');
  } finally {
    releasePdfWorker();
    await context.close();
    await member.remove();
  }
});

test('cancelling extraction terminates its worker and clears the selected file', async ({ browser }) => {
  const member = await createLocalMember('Synthetic CV Cancellation');
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: 'Synthetic CV Cancellation',
  });
  expect(error).toBeNull();

  const context = await browser.newContext();
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    await page.addInitScript(() => {
      const state = { terminated: false };
      Object.defineProperty(window, '__cvWorkerState', { configurable: true, value: state });
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        value: class {
          onmessage: ((event: MessageEvent) => void) | null = null;
          onerror: ((event: ErrorEvent) => void) | null = null;
          postMessage() {}
          terminate() {
            state.terminated = true;
          }
        },
      });
    });
    await page.goto('/onboarding?step=competencies');
    await page.getByLabel('Choose a DOCX or searchable PDF').setInputFiles({
      name: 'pending.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createDocx('Synthetic pending extraction'),
    });
    await page.getByRole('button', { name: 'Cancel import' }).click();
    await expect(page.getByRole('status')).toContainText('Import cancelled');
    await expect(page.locator('#cv-import-file')).toHaveValue('');
    expect(await page.evaluate(() => (window as unknown as { __cvWorkerState: { terminated: boolean } }).__cvWorkerState.terminated)).toBe(true);
  } finally {
    await context.close();
    await member.remove();
  }
});
