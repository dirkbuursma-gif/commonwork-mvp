export interface GuideBlock {
  heading: string;
  body: string;
  sourceIds?: string[];
}

export interface GuidePage {
  id: string;
  title: string;
  summary: string;
  blocks: GuideBlock[];
}

export interface PlatformExample {
  title: string;
  publisher: string;
  publishedAt: string;
  market: string;
  capability: string;
  boundary: string;
  sourceIds: string[];
}

export interface PlatformExampleSequence {
  id: string;
  title: string;
  note: string;
  examples: PlatformExample[];
}

export interface AudienceToolRole {
  provider: string;
  offering: string;
  stageRole: string;
  stageCapability: string;
  stageBoundary: string;
  challenge: string;
  capability: string;
  expertUser: string;
  output: string;
  limitation: string;
  sourceIds: string[];
}

export const platformExampleSequences: PlatformExampleSequence[] = [
  {
    id: 'research-recommendation',
    title: 'Sequence A · Research and recommendation',
    note: 'Two separate published examples; not one recorded customer session.',
    examples: [
      {
        title: 'Shopping Research',
        publisher: 'OpenAI',
        publishedAt: '24 November 2025',
        market: 'Signed-in Free, Go, Plus and Pro plans are listed; geography is not specified.',
        capability: 'OpenAI describes clarifying questions, current web research, refinement from feedback, a buyer guide and retailer links. The published stroller prompt is the connecting category example.',
        boundary: 'Publisher description, not a Commonwork-run session. A retailer link is not proof of seller selection or purchase. The source video is not included because playback/content and reuse status are unresolved.',
        sourceIds: ['openai-shopping-research'],
      },
      {
        title: 'Product Discovery',
        publisher: 'OpenAI',
        publishedAt: '24 March 2026',
        market: 'Rollout across listed plan tiers is described; geography is not explicit.',
        capability: 'OpenAI describes visual product results, merchant data and side-by-side comparison.',
        boundary: 'Separate published example, not the next recorded beat in the Shopping Research example. No Commonwork or retailer outcome is shown.',
        sourceIds: ['openai-shopping-discovery'],
      },
    ],
  },
  {
    id: 'delegated-checkout',
    title: 'Sequence B · Delegated checkout',
    note: 'A separate published action example; do not connect it to Sequence A as one transaction.',
    examples: [
      {
        title: 'Instant Checkout',
        publisher: 'OpenAI',
        publishedAt: '29 September 2025 announcement',
        market: 'The current announcement describes U.S. users and participating sellers; recheck eligibility before the event.',
        capability: 'OpenAI describes the user confirming order, shipping and payment details; the seller accepts or declines and handles payment processing and fulfillment.',
        boundary: 'Platform-published checkout description, not a Commonwork live test. Do not imply Portugal availability, unattended purchasing, or continuity with Sequence A.',
        sourceIds: ['openai-instant-checkout'],
      },
    ],
  },
];

export const audienceGuidePages: GuidePage[] = [
  {
    id: 'what-changes',
    title: 'What changes',
    summary: 'Agentic commerce presents real business challenges now. Research, product recommendation and delegated action are distinct capabilities.',
    blocks: [
      {
        heading: 'Research and recommendation',
        body: 'Follow the two separate published examples below. The stroller is a connecting category example, not a recorded transaction.',
        sourceIds: ['openai-shopping-research', 'openai-shopping-discovery'],
      },
      {
        heading: 'Delegated action',
        body: 'Checkout is a separate product flow with user authorization and seller responsibilities. Its market and participating sellers matter.',
        sourceIds: ['openai-instant-checkout'],
      },
    ],
  },
  {
    id: 'visibility-control',
    title: 'Visibility and control',
    summary: 'Separate the brand, retailer and platform questions. These are diagnostic questions, not asserted results.',
    blocks: [
      {
        heading: 'Brand',
        body: 'Was the product understood and considered for the customer’s task?',
        sourceIds: ['openai-shopping-research'],
      },
      {
        heading: 'Retailer',
        body: 'Were the offer facts accurate, and was this retailer included as seller or destination?',
        sourceIds: ['openai-shopping-research', 'openai-instant-checkout'],
      },
      {
        heading: 'Platform',
        body: 'Where did discovery, comparison and the next action happen? The platform controls its own retrieval and presentation; no participant can guarantee placement.',
        sourceIds: ['openai-shopping-discovery'],
      },
    ],
  },
  {
    id: 'expertise-ai',
    title: 'Expertise plus AI',
    summary: 'This is the speaker’s recommended operating model. The workflows are proposals, not retailer case studies.',
    blocks: [
      {
        heading: 'Marketing workflow',
        body: 'Customer question → expert judges audience, suitability, differentiation, substantiated claims and channel → AI assists with research, summarisation or adapting approved content → expert approves claims and handles exceptions → measure review time, correction rate and a campaign measure chosen before testing.',
        sourceIds: ['admultify-official'],
      },
      {
        heading: 'Operations workflow',
        body: 'Product/offer issue → expert identifies the source of truth, customer impact and safe correction → AI compares records, summarises a mismatch or drafts a work item → human approves changes and handles exceptions → measure resolution time, recurrence, data completeness and a preselected customer/operational measure.',
      },
    ],
  },
  {
    id: 'data-foundation',
    title: 'Product data and connected systems',
    summary: 'Govern product information and connect the systems a bounded use case needs. A new PIM is not required for every first experiment.',
    blocks: [
      {
        heading: 'Start with existing systems',
        body: 'Find owners and current sources for product identity, attributes, claims, price, availability, delivery and returns. Use existing catalogue, commerce or ERP capabilities where they are sufficient.',
        sourceIds: ['google-merchant-spec'],
      },
      {
        heading: 'Assess gaps',
        body: 'Check completeness, variant consistency, update timing, provenance, permissions, feed/API access, security and exception handling. Destination-specific rules apply only to their destination.',
        sourceIds: ['google-product-structured-data', 'google-merchant-spec'],
      },
      {
        heading: 'Invest where justified',
        body: 'Consider additional PIM capability, API integration, orchestration or monitoring when a repeated task exposes a specific gap. APIs do not guarantee assistant access or visibility.',
      },
    ],
  },
  {
    id: 'tools-by-job',
    title: 'Tools by job',
    summary: 'Evaluate challenge → documented capability → expert user → output. Vendor documentation is not independent outcome evidence.',
    blocks: [],
  },
  {
    id: 'first-month',
    title: 'Start with one bounded use case',
    summary: 'Start with one customer or operational task—not a platform replacement.',
    blocks: [
      { heading: 'Week 1 · Choose and baseline', body: 'Choose one task, an expert owner, a current baseline and a success measure.' },
      { heading: 'Week 2 · Assess', body: 'Identify the product/offer information, system access, permissions and controls needed. Start with existing systems.' },
      { heading: 'Week 3 · Test', body: 'Test one bounded AI-assisted workflow with human approval and a clear exception path.' },
      { heading: 'Week 4 · Review', body: 'Review the preselected measure and exceptions. Prioritise people, data or integration gaps; decide whether to repeat, stop or invest.' },
      { heading: 'Optional exercise · Visibility worksheet', body: 'Record one dated observation: exact request and context; products and sellers separately; reasons and sources; accuracy against the current offer; one evidenced gap and owner. A dated observation is not a ranking or benchmark.' },
    ],
  },
];

export const audienceToolRoles: AudienceToolRole[] = [
  {
    provider: 'Geoffy',
    offering: 'Optimise; Monitor is a separate offering the vendor marks early access.',
    stageRole: 'Product information',
    stageCapability: 'Product-page content and structured data; the vendor lists Optimise for Shopify and WordPress.',
    stageBoundary: 'Monitor is early access; no independent outcome or Commonwork demo.',
    challenge: 'Product-page content and consistency between visible information and structured data.',
    capability: 'Geoffy describes product-page content, structured data, claim checks and catalogue drift control. Its current site says Optimise is available for Shopify and WordPress.',
    expertUser: 'E-commerce, marketing and product-data owners.',
    output: 'Vendor-described product-page content and a structured-data mirror; monitoring is an early-access offering per Geoffy.',
    limitation: 'Vendor-documented capability, not proof of increased visibility or sales. No Commonwork demo or independent outcome is recorded.',
    sourceIds: ['geoffy-official', 'geoffy-shopify-listing'],
  },
  {
    provider: 'Begen · AdMultify',
    offering: 'AdMultify',
    stageRole: 'Creative production',
    stageCapability: 'Generates ad-creative variants from supplied assets.',
    stageBoundary: 'Not assistant-visibility measurement; no independent campaign outcome or Commonwork demo.',
    challenge: 'Producing campaign creative variants from approved source assets.',
    capability: 'Begen describes uploading a key visual, mapping assets, previewing/refining and generating ad variations.',
    expertUser: 'Marketing and creative teams.',
    output: 'Creative variants for expert review and distribution.',
    limitation: 'This is creative production, not product recommendation or assistant-visibility measurement. No independent campaign outcome or Commonwork demo is recorded.',
    sourceIds: ['admultify-official'],
  },
  {
    provider: 'Rierino',
    offering: 'Rierino Commerce / platform',
    stageRole: 'Commerce operations',
    stageCapability: 'Commerce services, APIs and agent orchestration for operational workflows.',
    stageBoundary: 'Vendor-described platform; confirm module and scope. No independent result or Commonwork integration.',
    challenge: 'Connecting commerce services and orchestrating complex operational workflows.',
    capability: 'Rierino describes commerce modules, APIs/workflows and agent-executed pricing, inventory and promotion flows; its docs describe deployable agents and orchestration.',
    expertUser: 'Commerce operations, product-data and architecture teams.',
    output: 'Configured commerce services, APIs and workflows, subject to implementation and governance.',
    limitation: 'Vendor-documented platform capability, not an independent result or Commonwork integration/demo. Confirm the exact module and commercial scope.',
    sourceIds: ['rierino-commerce', 'rierino-docs'],
  },
];

export const presentationSectionCopy: Record<string, { title: string; summary: string }> = {
  'decision-before-visit': {
    title: 'AI recommends the product—and points to the seller.',
    summary: 'One response shapes consideration before a store visit.',
  },
  'shopper-assistant-today': {
    title: 'Agents, assistants and new decision intermediaries',
    summary: 'They can shape discovery, comparison and the next action at different stages.',
  },
  'three-visibility-questions': {
    title: 'Visibility for brands, retailers and platforms',
    summary: 'These are questions to investigate—not results to assume.',
  },
  'recommendation-influence': {
    title: 'Who controls which parts of the journey?',
    summary: 'Inputs, platform rules, permissions and seller actions have different owners.',
  },
  'check-your-visibility': {
    title: 'Expertise first. AI makes it more effective.',
    summary: 'Marketing and operations experts can use AI inside controlled workflows.',
  },
  'from-observation-to-correction': {
    title: 'Start with a use case. Build the foundation to scale it.',
    summary: 'Govern product information and connect the systems the task needs.',
  },
  'tools-by-job': {
    title: 'Tools by job',
    summary: 'Different tools do different jobs; vendor claims are not outcomes.',
  },
  'next-retailer-test': {
    title: 'Start with one bounded use case',
    summary: 'Choose a task, establish a baseline, test with controls, then decide.',
  },
};

export const presentationVisibilityQuestions = [
  { label: 'Brand', question: 'Was the product understood and considered?' },
  { label: 'Retailer', question: 'Was the offer accurate and this seller included?' },
  { label: 'Platform', question: 'Where did discovery, comparison and the next action happen?' },
];

export const presentationExpertWorkflows = [
  {
    title: 'Marketing',
    objective: 'Respond to a customer question or campaign task.',
    expert: 'Judge audience, suitability, differentiation, substantiated claims and channel.',
    ai: 'Assist with research, summarisation or adapting approved material.',
    control: 'Expert approves facts and brand/legal constraints; uncertain claims go to review.',
    measure: 'Choose review time, correction rate and a campaign measure before testing.',
  },
  {
    title: 'Operations',
    objective: 'Resolve a product/offer issue affecting a customer task.',
    expert: 'Identify the source of truth, customer impact and safe correction.',
    ai: 'Compare records, summarise a mismatch or draft a work item.',
    control: 'Human approves data/system changes and handles exceptions.',
    measure: 'Choose resolution time, recurrence, completeness and a customer/operations measure.',
  },
];

export const presentationFoundationSteps = [
  { title: 'Start with existing systems', detail: 'Find current product/offer sources, owners and usable exports or feeds.' },
  { title: 'Assess gaps', detail: 'Check attributes, variants, update timing, provenance, permissions and access.' },
  { title: 'Invest where justified', detail: 'Improve PIM capability, APIs, orchestration or controls when a repeated need is clear.' },
];

export const presentationFirstMonthSteps = [
  { title: 'Choose and baseline', detail: 'One customer task, an expert owner and a success measure.' },
  { title: 'Assess', detail: 'Product data, system access, permissions and controls; start with existing systems.' },
  { title: 'Test and review', detail: 'Run a human-approved AI workflow; review results and exceptions, then repeat, stop or invest.' },
];
