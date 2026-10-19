// Shared draft content for audience, presentation and print views.

import { perplexityStrollerExample } from './perplexity-stroller-example';

export type VerificationStatus = 'draft' | 'unverified' | 'needs-source' | 'source-backed';
export type EvidenceKind =
  | 'official-platform-statement'
  | 'vendor-claim'
  | 'editorial-interpretation'
  | 'observed-demo';
export type ContentKind =
  | 'editorial'
  | 'illustrative'
  | 'official-source-link'
  | 'prepared-demo'
  | 'vendor-claim'
  | 'live-result';

export const statusLabels: Record<VerificationStatus, string> = {
  draft: 'Draft',
  unverified: 'Unverified',
  'needs-source': 'Source needed',
  'source-backed': 'Source-backed',
};

export const kindLabels: Record<ContentKind, string> = {
  editorial: 'Draft editorial copy',
  illustrative: 'Illustrative example',
  'official-source-link': 'Official platform source',
  'prepared-demo': 'Prepared demonstration',
  'vendor-claim': 'Vendor claim',
  'live-result': 'Live result',
};

export interface Point {
  text: string;
  kind: ContentKind;
  status: VerificationStatus;
  sourceIds?: string[];
}

export interface SourceRef {
  id: string;
  label: string;
  url: string;
  publisher: string;
  publishedAt: string;
  kind: EvidenceKind;
  status: VerificationStatus;
  note: string;
}

export interface DemoPlaceholder {
  title: string;
  kind: 'official-source-link' | 'prepared-demo';
  description: string;
  fallback: string;
  status: VerificationStatus;
  videoId?: string;
  sourceUrl?: string;
}

export interface VideoClip {
  id: string;
  title: string;
  purpose: string;
  sourceUrl: string | null;
  publisher: string;
  publishedAt: string;
  platformFeature: string;
  marketLimits: string;
  proposedStart: string;
  proposedEnd: string;
  notice: string;
  permission: string;
  fallback: string;
  explanatoryText: string;
  state: 'official-source-link' | 'recording-not-made';
}

export interface PlaybookSection {
  id: string;
  number: number;
  title: string;
  summary: string;
  points: Point[];
  explanation: string[];
  speakerNotes: string[];
  demo?: DemoPlaceholder;
  videoIds?: string[];
  showVisibilityModel?: boolean;
  showVisibilityQuestions?: boolean;
  showWorksheet?: boolean;
  showClaimTable?: boolean;
  showTools?: boolean;
  showChecklist?: boolean;
  showResources?: boolean;
  sources: SourceRef[];
}

export interface ChecklistItem { id: string; text: string; }
export interface ChecklistGroup { id: string; title: string; items: ChecklistItem[]; }
export interface WorksheetPrompt { id: string; prompt: string; note: string; }
export interface WorksheetField { id: string; label: string; guidance: string; }

export interface FeaturedTool {
  id: string;
  name: string;
  kind: ContentKind;
  job: 'Observe' | 'Diagnose' | 'Improve' | 'Monitor';
  intendedRole: string;
  url: string | null;
  sourceId: string;
  caveat: string;
  demoPermission: string;
  status: VerificationStatus;
}

export interface ToolStage {
  job: FeaturedTool['job'];
  method: string;
}

export interface Resource {
  label: string;
  note: string;
  url: string | null;
  sourceId: string;
  status: VerificationStatus;
}

export interface ClaimEvidence {
  claim: string;
  kind: EvidenceKind;
  sourceId: string;
  caveat: string;
}

export const event = {
  title: 'Agentic commerce: visibility before the click',
  location: 'Lisbon',
  details: 'Event date and exact organiser attribution to be confirmed.',
  organiserBranding: 'INRETAIL / Skolae brand placement pending Dirk review of supplied template.',
};

export const draftNotice =
  'Draft for review. Platform features are attributed statements, not independent tests. Vendor descriptions are vendor claims. The worksheet is a proposed diagnostic, not a benchmark.';

export const sources: SourceRef[] = [
  {
    id: 'openai-shopping-research',
    label: 'Introducing shopping research in ChatGPT',
    url: 'https://openai.com/en-US/index/chatgpt-shopping-research/',
    publisher: 'OpenAI',
    publishedAt: '24 November 2025',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Describes prompts, clarifying questions, web research, feedback, buyer guides and retailer click-through. The article lists signed-in Free, Go, Plus and Pro plans; geographic availability is not specified. Checkout is separate.',
  },
  {
    id: 'openai-shopping-discovery',
    label: 'Powering Product Discovery in ChatGPT',
    url: 'https://openai.com/index/powering-product-discovery-in-chatgpt/',
    publisher: 'OpenAI',
    publishedAt: '24 March 2026',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Describes visual product results, side-by-side comparison and product discovery supported by merchant data and integrations. This is the platform publisher’s account, not an independent evaluation.',
  },
  {
    id: 'openai-instant-checkout',
    label: 'Buy it in ChatGPT: Instant Checkout and the Agentic Commerce Protocol',
    url: 'https://openai.com/index/buy-it-in-chatgpt/',
    publisher: 'OpenAI',
    publishedAt: '29 September 2025',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Launch-time description says eligible products can be bought after user confirmation; the seller handles acceptance, payment processing, fulfilment and support. It described initial U.S. availability and participating sellers; do not treat launch details as current coverage.',
  },
  {
    id: 'amazon-alexa-shopping',
    label: 'Meet Alexa for Shopping, your personalized, agentic AI assistant on Amazon',
    url: 'https://www.aboutamazon.com/news/retail/alexa-for-shopping-ai-assistant',
    publisher: 'Amazon',
    publishedAt: '13 May 2026',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Amazon says Alexa for Shopping combines Rufus and Alexa+, supports product questions/comparisons and operates on Amazon shopping surfaces. The announcement specifies U.S. availability and sign-in. Treat capabilities as Amazon statements.',
  },
  {
    id: 'google-product-structured-data',
    label: 'Introduction to Product structured data',
    url: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    publisher: 'Google Search Central',
    publishedAt: 'Last updated 10 December 2025',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Explains product snippets, merchant listings, data sources and that Search enhancements are shown at Google’s discretion and may change. Eligibility is not guaranteed placement.',
  },
  {
    id: 'google-merchant-spec',
    label: 'Product data specification',
    url: 'https://support.google.com/merchants/answer/7052112',
    publisher: 'Google Merchant Center Help',
    publishedAt: 'Current documentation; page date not displayed',
    kind: 'official-platform-statement',
    status: 'source-backed',
    note: 'Specifies fields and consistency requirements for Google Merchant Center destinations. Requirements vary by destination/country and are not universal assistant requirements.',
  },
  {
    id: 'geoffy-official',
    label: 'Geoffy: GEO for Shopify and WooCommerce stores',
    url: 'https://geoffy.ai/',
    publisher: 'Geoffy',
    publishedAt: 'Current vendor site; retrieved 14 October 2026',
    kind: 'vendor-claim',
    status: 'unverified',
    note: 'Vendor describes product-page content, structured data, catalogue checks and visibility monitoring. Its site labels Monitor and Influence early access and states current Shopify and WordPress/WooCommerce availability. Verify edition and permission before any demo.',
  },
  {
    id: 'geoffy-shopify-listing',
    label: 'Geoffy on the Shopify App Store',
    url: 'https://apps.shopify.com/geoffy',
    publisher: 'Shopify App Store / Geoffy listing',
    publishedAt: 'Introduced 6 February 2026; retrieved 14 October 2026',
    kind: 'vendor-claim',
    status: 'unverified',
    note: 'Listing describes product-data review, generated content and monitoring. Listing copy and reviews are not independent performance evidence.',
  },
  {
    id: 'admultify-official',
    label: 'AdMultify by Begen',
    url: 'https://begen.ai/',
    publisher: 'Begen',
    publishedAt: 'Current vendor site; retrieved 14 October 2026',
    kind: 'vendor-claim',
    status: 'unverified',
    note: 'Vendor describes creating and previewing ad-creative variations from supplied assets. This is creative production, not evidence of assistant visibility or recommendation placement.',
  },
  {
    id: 'rierino-commerce',
    label: 'Rierino Commerce',
    url: 'https://rierino.com/solutions/commerce',
    publisher: 'Rierino',
    publishedAt: 'Current vendor site; retrieved 14 October 2026',
    kind: 'vendor-claim',
    status: 'unverified',
    note: 'Vendor describes B2C/B2B/marketplace commerce and agentic operations. This is commerce platform/backend infrastructure, not a visibility tool. Validate the exact module and demo scope.',
  },
  {
    id: 'rierino-docs',
    label: 'Rierino platform documentation overview',
    url: 'https://docs.rierino.com/',
    publisher: 'Rierino documentation',
    publishedAt: 'Current documentation; page date not displayed',
    kind: 'vendor-claim',
    status: 'unverified',
    note: 'Documentation describes configuration-first microservices, orchestration, APIs and AI-agent building blocks. No Commonwork integration is claimed.',
  },
];

export const sourceById = Object.fromEntries(sources.map((source) => [source.id, source])) as Record<string, SourceRef>;

export const claimEvidence: ClaimEvidence[] = [
  { claim: 'Shopping Research can ask clarifying questions, refine options and produce a guide with retailer links.', kind: 'official-platform-statement', sourceId: 'openai-shopping-research', caveat: 'Publisher-described feature; recheck account and regional availability for the event.' },
  { claim: 'A product being named is different from a specific retailer being offered as seller.', kind: 'editorial-interpretation', sourceId: 'openai-shopping-research', caveat: 'Framing distinction, not a platform metric. Observe product and seller separately.' },
  { claim: 'Google Search can use structured product data and Merchant Center feeds; enhanced display remains discretionary.', kind: 'official-platform-statement', sourceId: 'google-product-structured-data', caveat: 'Google Search only; not evidence of how other assistants select products.' },
  { claim: 'Google Merchant Center specifies product, offer, shipping and return fields for applicable destinations.', kind: 'official-platform-statement', sourceId: 'google-merchant-spec', caveat: 'Requirements vary by destination/country; check current documentation.' },
  { claim: 'Geoffy describes product-page optimization and visibility monitoring; its site marks Monitor as early access.', kind: 'vendor-claim', sourceId: 'geoffy-official', caveat: 'Not an independent audit or verified customer outcome.' },
  { claim: 'AdMultify is positioned by Begen for producing ad-creative variations from supplied assets.', kind: 'vendor-claim', sourceId: 'admultify-official', caveat: 'Creative production is distinct from assistant visibility measurement.' },
  { claim: 'Rierino describes commerce, backend orchestration and AI-agent capabilities.', kind: 'vendor-claim', sourceId: 'rierino-commerce', caveat: 'No Commonwork integration or retailer result is claimed.' },
];

export const videoShortlist: VideoClip[] = [
  {
    id: 'shopper-research',
    title: 'ChatGPT Shopping Research: official feature demo',
    purpose: 'Show assistant-led research and distinguish product advice from seller click-through.',
    sourceUrl: 'https://openai.com/en-US/index/chatgpt-shopping-research/',
    publisher: 'OpenAI',
    publishedAt: '24 November 2025; source page player displays 00:52 total',
    platformFeature: 'ChatGPT Shopping Research on web/mobile, as described by OpenAI.',
    marketLimits: 'Article lists signed-in Free, Go, Plus and Pro plans; geography is unspecified. Recheck Portugal availability for the event.',
    proposedStart: '00:00',
    proposedEnd: '00:52',
    notice: 'On 15 October 2026, the embedded player showed “Player error” in the review browser. Do not cite specific video beats or include a clip until playback and content are rechecked.',
    permission: 'No explicit reuse/re-host permission found. Link to the original page and use its own controls; do not download or embed unless permission is confirmed.',
    fallback: 'Static flow: request → clarification → product guide and trade-offs → retailer link. Verify seller, price and terms at the destination.',
    explanatoryText: 'OpenAI says Shopping Research can clarify needs, search current information, refine options from feedback and produce a guide with retailer links. A retailer link is not an autonomous purchase.',
    state: 'official-source-link',
  },
  {
    id: 'retailer-worksheet-walkthrough',
    title: 'Retailer perspective: record one visibility observation',
    purpose: 'Show how to separate product consideration, factual representation and seller selection in the worksheet.',
    sourceUrl: null,
    publisher: 'Proposed Commonwork-authored recording; not recorded',
    publishedAt: 'Not recorded; add the actual date before use',
    platformFeature: 'Local worksheet; no third-party assistant or retailer result in the current fallback.',
    marketLimits: 'A future real-platform recording must state market, language, account state and session context.',
    proposedStart: '00:00',
    proposedEnd: '00:45',
    notice: 'Proposed shot list: enter sample request; record assistant/date/market; separate brand/product from seller; note reasons and sources; check the current offer; assign a follow-up. No result is fabricated.',
    permission: 'No recording exists. A future worksheet capture would be Commonwork-authored; obtain approval and date it. A real platform recording requires separate permission and a clean session.',
    fallback: 'Static blank worksheet with the same fields and prompts. Nothing is saved or submitted.',
    explanatoryText: 'One row is a time-stamped observation from one session. Repeat selected prompts with context recorded before comparing. It is not a ranking or validated benchmark.',
    state: 'recording-not-made',
  },
];

export const worksheetPrompts: WorksheetPrompt[] = [
  { id: 'stroller', prompt: 'I need a stroller that is lightweight, compact and easy to fold, comfortable for a toddler, and suitable for city sidewalks and some rougher terrain. Please compare options and explain the trade-offs.', note: 'Adapted from an OpenAI example prompt; no answer has been recorded.' },
  { id: 'washer-dryer', prompt: 'I need a washer-dryer for a small apartment in Lisbon. What should I compare before choosing one?', note: 'Proposed prompt; no result has been run or recorded.' },
  { id: 'rain-jacket', prompt: 'Help me choose a rain jacket for cycling to work in wet weather. Compare the features I should care about and tell me what you cannot verify.', note: 'Proposed prompt; no result has been run or recorded.' },
];

export const worksheetFields: WorksheetField[] = [
  { id: 'exact-request', label: 'Exact shopper request', guidance: 'Copy the prompt exactly, including budget, constraints and wording.' },
  { id: 'assistant-context', label: 'Assistant, date, market and session context', guidance: 'Record product, date/time, country/language, account state, personalization state if known, and new or continuing session.' },
  { id: 'brands-products', label: 'Brands and products surfaced', guidance: 'Record names, order and displayed variants/specifications. Leave blank if none.' },
  { id: 'retailers-sellers', label: 'Retailers or sellers surfaced', guidance: 'Record the seller separately from brand/product and note any direct retailer link.' },
  { id: 'reasons', label: 'Reasons given', guidance: 'Capture stated suitability rationale and trade-offs, if given.' },
  { id: 'accuracy', label: 'Accuracy against current retailer offer', guidance: 'Check product, price, stock, delivery, returns and seller identity against the live offer.' },
  { id: 'sources', label: 'Sources and links shown', guidance: 'Record citations, product URLs and merchant links; note where each resolves.' },
  { id: 'observation', label: 'Observation record or screenshot reference', guidance: 'Use a sanitized reference; never include personal data, customer information or account details.' },
  { id: 'gap', label: 'Identified gap', guidance: 'Describe the mismatch or absence. Distinguish “not observed” from “confirmed absent.”' },
  { id: 'owner-next', label: 'Action owner and next step', guidance: 'Name an internal role/owner and one verifiable follow-up; no one can guarantee placement.' },
];

export const influenceActors = [
  { id: 'shopper', label: 'Shopper intent and context', detail: 'Sets need, constraints and feedback; does not directly control the candidate set.' },
  { id: 'brand', label: 'Brand product information', detail: 'Supplies identity, attributes, claims and brand-owned sources. Accurate facts do not guarantee consideration.' },
  { id: 'retailer', label: 'Retailer offer and operations', detail: 'Owns seller identity, offer, price, availability, delivery, returns and destination experience.' },
  { id: 'third-party', label: 'Third-party sources', detail: 'Reviews, editorial comparisons, community answers and other pages may inform a response if retrieved.' },
  { id: 'assistant', label: 'Platform or assistant', detail: 'Controls its retrieval, selection and presentation rules within its product and commercial context.' },
];

export const visibilityQuestions = [
  {
    id: 'considered',
    question: 'Was the brand or product considered?',
    example: 'OpenAI describes Shopping Research as building a buyer guide with product options. This is a feature description, not a recorded output for our sample prompt.',
    sourceId: 'openai-shopping-research',
  },
  {
    id: 'represented',
    question: 'Were product and offer facts represented accurately?',
    example: 'OpenAI says answers can contain product-detail errors; check the current retailer offer before acting on price or availability.',
    sourceId: 'openai-shopping-research',
  },
  {
    id: 'seller',
    question: 'Was this retailer offered as the seller?',
    example: 'OpenAI describes click-through to retailer sites. Follow the actual destination to identify the seller; no specific merchant result is claimed here.',
    sourceId: 'openai-shopping-research',
  },
];

export const toolStages: ToolStage[] = [
  { job: 'Observe', method: 'Record a response with the worksheet; compare product, seller and sources.' },
  { job: 'Diagnose', method: 'Interpret the evidence and verify the fact. No named diagnostic product is assigned here.' },
  { job: 'Improve', method: 'Change a retailer-owned input or operation. Confirm each vendor tool’s fit before use.' },
  { job: 'Monitor', method: 'Repeat the same question/context. Geoffy describes this capability as early access.' },
];

export interface PanelDebatePrompt {
  topic: string;
  statement: string;
  question: string;
}

export const panelDebatePrompts: PanelDebatePrompt[] = [
  {
    topic: 'Discovery & Data Governance',
    statement: 'If an AI agent cannot verify and trust your product facts in real time, your brand does not enter the consideration set.',
    question: 'Are retailers over-investing in driving web traffic while under-investing in structured data and catalog governance?',
  },
  {
    topic: 'Channel Control & Margin',
    statement: 'Having your product recommended is useless if the seller link defaults to a third-party marketplace instead of your store.',
    question: 'Who captures the commercial value in agentic commerce: the brand, the retailer, or the interface platform?',
  },
  {
    topic: 'Operating Model & Competence',
    statement: 'Winning in agentic commerce requires experts who know how to govern AI workflows—not just buying more tools.',
    question: 'Do retailers need a complete platform replacement, or is the priority upskilling teams and connecting existing APIs?',
  },
];

export const presentationOpeningNote = `Introduce yourself as Dirk Buursma from Commerce Partners.
Introduce Commonwork separately as the Collaborative Commerce Network,
then transition into the agentic commerce presentation.`;

export const sections: PlaybookSection[] = [
  {
    id: 'decision-before-visit', number: 1, title: 'A buying decision before the website visit',
    summary: 'A shopper starts with a need, not a list of retailers.',
    points: [
      { text: '“I need a compact stroller for city walks and rough paths.”', kind: 'illustrative', status: 'source-backed', sourceIds: ['openai-shopping-research'] },
      { text: 'An assistant can turn constraints into questions and a comparison before a store visit.', kind: 'editorial', status: 'source-backed', sourceIds: ['openai-shopping-research'] },
      { text: 'Will your product be considered—and will your shop be offered as the seller?', kind: 'editorial', status: 'draft' },
    ],
    explanation: ['Start with a familiar buying job: someone needs a stroller, knows constraints, but has not chosen a brand or store. The retailer challenge is that the first comparison may happen inside an assistant rather than on a retailer category page.', 'The shopper wording is adapted from an example prompt in OpenAI’s published Shopping Research article. It is not a recorded session or a market-trend claim.'],
    speakerNotes: [
      perplexityStrollerExample.presenterNote,
      perplexityStrollerExample.presenterAccuracyGate,
      'Ask what information the audience needs before recommending a stroller: use case, constraints, trade-offs, evidence and delivery context.',
      'Then ask when a retailer first enters that decision. Do not begin with a technology definition or platform history.',
    ],
    sources: [sourceById['openai-shopping-research']],
  },
  {
    id: 'shopper-assistant-today', number: 2, title: 'What the shopper can do today',
    summary: 'Request → clarification → shortlist → comparison → seller options.',
    points: [
      { text: 'Describe a need and constraints in ordinary language.', kind: 'editorial', status: 'source-backed', sourceIds: ['openai-shopping-research'] },
      { text: 'Answer follow-up questions and refine candidates with feedback.', kind: 'editorial', status: 'source-backed', sourceIds: ['openai-shopping-research'] },
      { text: 'Review a guide/comparison, then follow a retailer link to verify the offer.', kind: 'editorial', status: 'source-backed', sourceIds: ['openai-shopping-research'] },
      { text: 'Product discovery is distinct from checkout and purchasing.', kind: 'editorial', status: 'draft', sourceIds: ['openai-shopping-research', 'openai-instant-checkout'] },
    ],
    explanation: ['OpenAI says Shopping Research asks clarifying questions, searches for current information, responds to feedback and produces a guide. It says shoppers can click through to a retailer to buy.', 'Instant Checkout is separate. OpenAI’s 29 September 2025 launch announcement described U.S. availability and user confirmation of order, shipping and payment. Recheck current coverage before mentioning availability.'],
    speakerNotes: ['Open the official source clip in its original player. Pause only at beats actually visible: request, clarification, comparison and retailer link.', 'Ask whether the example demonstrates product recommendation, merchant selection, or both. Do not imply autonomous purchasing.'],
    videoIds: ['shopper-research'],
    demo: { title: 'Official source clip: Shopping Research', kind: 'official-source-link', description: 'OpenAI’s English source page lists a 52-second feature video. The player showed “Player error” in the review browser on 15 October 2026; playback/content remain unverified.', fallback: 'Static source summary: request → clarification → product guide and trade-offs → retailer link. Verify seller, price and terms at the destination.', status: 'source-backed', videoId: 'shopper-research', sourceUrl: 'https://openai.com/en-US/index/chatgpt-shopping-research/' },
    sources: [sourceById['openai-shopping-research'], sourceById['openai-instant-checkout']],
  },
  {
    id: 'three-visibility-questions', number: 3, title: 'Brand visibility is not retailer visibility',
    summary: 'Ask three separate questions about the product, its facts and the seller.',
    points: [
      { text: 'Consideration: was the brand or product included among options?', kind: 'editorial', status: 'draft' },
      { text: 'Representation: were attributes, suitability and offer facts accurate?', kind: 'editorial', status: 'draft' },
      { text: 'Seller selection: was this retailer offered, linked or selected?', kind: 'editorial', status: 'draft' },
    ],
    explanation: ['An assistant can mention a product without sending the shopper to a particular retailer. It can accurately describe a product while an offer is stale, or recommend the product but link to a marketplace or another seller.', 'OpenAI says Shopping Research can link to retailers. Its separate checkout launch article describes factors for ranking multiple sellers of the same product at launch. That is a platform-published description, not a universal rule.'],
    speakerNotes: ['Use three columns: considered, represented, seller offered. Populate only from the source clip or a captured observation.', 'Ask which of the three current retailer analytics can answer. Missing observation is not proof of zero visibility.'],
    showVisibilityQuestions: true,
    sources: [sourceById['openai-shopping-research'], sourceById['openai-instant-checkout']],
  },
  {
    id: 'recommendation-influence', number: 4, title: 'Who shapes the recommendation?',
    summary: 'Influence is distributed. No participant can guarantee placement.',
    points: [
      { text: 'Shopper intent and context define the request and feedback.', kind: 'editorial', status: 'draft' },
      { text: 'Brands and retailers supply product facts, claims and live offers.', kind: 'editorial', status: 'draft' },
      { text: 'Third-party sources may inform an answer if retrieved.', kind: 'editorial', status: 'draft' },
      { text: 'The platform/assistant controls its own retrieval, selection and presentation rules.', kind: 'editorial', status: 'draft' },
      { text: 'Amazon describes Alexa for Shopping inside its store; OpenAI describes Shopping Research linking to retailer sites.', kind: 'editorial', status: 'source-backed', sourceIds: ['amazon-alexa-shopping', 'openai-shopping-research'] },
    ],
    explanation: ['A recommendation is shaped by shopper context, product and offer information, retrieved sources, and the assistant’s selection and presentation. These are interacting influences, not a promise that any source owner controls the final response.', 'A retailer-owned assistant operates inside that retailer’s shopping environment. Amazon describes Alexa for Shopping in Amazon’s app and website and specifies U.S. availability. ChatGPT Shopping Research can link to retailer sites; separate apps and checkout partnerships add platform-specific flows. “Independent” describes who operates the assistant surface, not an absence of commercial relationships.'],
    speakerNotes: ['Use this as an illustrative influence map, not a documented technical architecture or a complete account of recommendation factors.', 'Ask which inputs a retailer can change. Influence is not control; no participant can guarantee placement. Do not imply either surface is neutral or fully independent.'],
    showVisibilityModel: true,
    sources: [sourceById['openai-shopping-research'], sourceById['amazon-alexa-shopping']],
  },
  {
    id: 'check-your-visibility', number: 5, title: 'Check your own visibility',
    summary: 'Treat each assistant response as a dated observation, not a definitive ranking.',
    points: [
      { text: 'Capture the exact shopper request and session context.', kind: 'editorial', status: 'draft' },
      { text: 'Record product/brand and seller separately, with reasons and links.', kind: 'editorial', status: 'draft' },
      { text: 'Repeat selected tests; do not turn one answer into a score.', kind: 'editorial', status: 'draft' },
    ],
    explanation: ['The worksheet records what one assistant showed for one prompt, date, market and session. Output can vary by context and over time. One answer is a clue, not a population-wide ranking or validated benchmark.', 'The sample prompts are test ideas only. No product results have been run or recorded for them.'],
    speakerNotes: ['Choose one category and a precise shopper need. Record assistant, date, market, language, account state and session context before discussing the answer.', 'Repeat selected prompts in separate sessions. Preserve the record; do not average incomparable contexts or report an unexplained visibility score.'],
    showWorksheet: true,
    videoIds: ['retailer-worksheet-walkthrough'],
    demo: { title: 'Retailer perspective: worksheet walkthrough', kind: 'prepared-demo', description: 'A proposed 30–45 second Commonwork-authored capture of the blank worksheet. No recording or live assistant result exists yet.', fallback: 'Static fallback: the blank worksheet below, with product, seller and source fields kept separate.', status: 'draft', videoId: 'retailer-worksheet-walkthrough' },
    sources: [sourceById['openai-shopping-research']],
  },
  {
    id: 'from-observation-to-correction', number: 6, title: 'From observation to correction',
    summary: 'Turn a specific mismatch into an owned, testable correction.',
    points: [
      { text: 'Check product attributes, suitability claims, price and availability.', kind: 'editorial', status: 'draft', sourceIds: ['google-merchant-spec'] },
      { text: 'Check delivery, returns, seller identity and source consistency.', kind: 'editorial', status: 'draft', sourceIds: ['google-merchant-spec', 'google-product-structured-data'] },
      { text: 'Separate platform-specific requirements from general data-quality practice.', kind: 'editorial', status: 'draft', sourceIds: ['google-product-structured-data'] },
      { text: 'Assign an owner; after a correction, repeat the same request and record the new context.', kind: 'editorial', status: 'draft' },
    ],
    explanation: ['Correct the retailer-controlled fact first: product data, offer, stock, delivery, returns, seller identity or source page. Then identify who owns the data and when the same prompt will be tested again.', 'Google Merchant Center and Search documentation provides concrete requirements for Google destinations. These are not universal assistant requirements. Better information is a general operating recommendation, not a placement guarantee.'],
    speakerNotes: ['Classify a gap as retailer-owned, third-party, assistant/platform, or unknown. Route retailer-owned gaps to a named data/commerce owner. After a correction, repeat the same request and record the new context.', 'Use Google requirements only when discussing Google surfaces. Do not present them as an AI shopping standard.'],
    sources: [sourceById['google-product-structured-data'], sourceById['google-merchant-spec']],
  },
  {
    id: 'tools-by-job', number: 7, title: 'Tools for specific jobs',
    summary: 'Observe, diagnose, improve and monitor—without asking one tool to do every job.',
    points: [
      { text: 'The worksheet is the manual observation method in this session.', kind: 'editorial', status: 'draft' },
      { text: 'Geoffy describes product-content engineering and visibility monitoring; Monitor is early access per its site.', kind: 'vendor-claim', status: 'unverified', sourceIds: ['geoffy-official'] },
      { text: 'AdMultify describes ad-creative variation, not assistant visibility measurement.', kind: 'vendor-claim', status: 'unverified', sourceIds: ['admultify-official'] },
      { text: 'Rierino describes commerce/backend and AI-agent operations, not a visibility audit.', kind: 'vendor-claim', status: 'unverified', sourceIds: ['rierino-commerce', 'rierino-docs'] },
    ],
    explanation: ['These are different jobs and product categories, not a recommended stack. Roles below summarize public vendor material; they are not independent evaluations, integrations with Commonwork, endorsements or proof of outcomes.', 'An official vendor page records what the vendor says about a capability; it is not independent evidence of performance or an outcome. No vendor capability has been demonstrated by Commonwork for this presentation.', 'Confirm preferred names, current feature availability and demo permission before showing product UI. Do not present vendor-reported visibility changes as independently measured.'],
    speakerNotes: ['Start with the job: observe a response; diagnose a data/source gap; improve an owned input or operation; monitor the same test over time.', 'Geoffy: vendor site marks Monitor and Influence as early access. AdMultify: vendor describes creative variations from supplied assets. Rierino: vendor describes commerce/backend and agent operations. Cite and label; do not imply Commonwork integration.', 'Keep vendor-documented capability, performance/outcome evidence, and capability demonstrated by Commonwork as separate evidence classes. Do not treat vendor descriptions as either of the latter two.'],
    showTools: true,
    sources: [sourceById['geoffy-official'], sourceById['geoffy-shopify-listing'], sourceById['admultify-official'], sourceById['rierino-commerce'], sourceById['rierino-docs']],
  },
  {
    id: 'next-retailer-test', number: 8, title: 'What the retailer does next',
    summary: 'Run a bounded test, prioritise an evidenced gap, and repeat.',
    points: [
      { text: 'Select one product category and three realistic shopper questions.', kind: 'editorial', status: 'draft' },
      { text: 'Repeat selected questions; capture context, answer, seller and sources.', kind: 'editorial', status: 'draft' },
      { text: 'Prioritise by impact, evidence confidence, retailer control and effort—not an opaque score.', kind: 'editorial', status: 'draft' },
      { text: 'Choose one owner and date to repeat the request with its context recorded.', kind: 'editorial', status: 'draft' },
    ],
    explanation: ['Suggested exercise: choose one category; run three prompt types in a documented assistant/market/session; repeat selected prompts; separate product, representation and seller; identify one retailer-controlled gap; assign an owner; rerun after a correction.', 'Prioritise qualitatively using customer impact, confidence in the observation, retailer control and effort. This is a proposed method, not a validated benchmark or readiness score.', 'The optional Commonwork route remains a placeholder because no public commercial-enquiry route is approved. No email or sign-up is required to use the playbook.'],
    speakerNotes: [
      'Optional audience question: “Which category and prompt will you test first?” Invite attendees to use the bounded test, not to accept a score or vendor recommendation.',
      'Introduce the panel debate by presenting each statement, then inviting the panel to address its question.',
      ...panelDebatePrompts.map(({ topic, statement, question }) => `${topic}: “${statement}” Debate question: “${question}”`),
      'Contact is not part of this stage close. Do not collect email addresses or require registration during this exercise.',
    ],
    showResources: true,
    showClaimTable: true,
    sources: [sourceById['openai-shopping-research'], sourceById['openai-instant-checkout'], sourceById['google-product-structured-data'], sourceById['google-merchant-spec']],
  },
];

export const checklist: ChecklistGroup[] = [
  { id: 'product-data', title: 'Product data', items: [
    { id: 'pd-id', text: 'Products have stable identifiers and clear titles.' },
    { id: 'pd-attrs', text: 'Important suitability attributes are complete and consistently named.' },
    { id: 'pd-variants', text: 'Variants (size, colour, model) are distinguishable and correctly grouped.' },
    { id: 'pd-claims', text: 'Claims can be substantiated; unknown attributes are not guessed.' },
  ] },
  { id: 'retailer-offer', title: 'Retailer offer', items: [
    { id: 'offer-price', text: 'Price and currency match the current landing page and checkout.' },
    { id: 'offer-stock', text: 'Availability matches the offer a shopper can actually buy.' },
    { id: 'offer-delivery', text: 'Delivery cost/timing and geographic limitations are clear.' },
    { id: 'offer-returns', text: 'Returns and warranty terms are easy to locate and current.' },
  ] },
  { id: 'sources-ops', title: 'Sources and ownership', items: [
    { id: 'source-consistent', text: 'Key product facts agree across product page, feeds and other retailer-owned sources.' },
    { id: 'owner-data', text: 'A person/team owns product and offer corrections.' },
    { id: 'owner-retest', text: 'A person/team can repeat and document selected assistant observations.' },
  ] },
];

export const tools: FeaturedTool[] = [
  { id: 'worksheet', name: 'Commonwork visibility worksheet', kind: 'editorial', job: 'Observe', intendedRole: 'Manually record prompt, context, products, sellers, reasons, sources, accuracy, gap and owner.', url: null, sourceId: 'openai-shopping-research', caveat: 'Proposed diagnostic only; not validated, automated or scored.', demoPermission: 'Commonwork-authored worksheet; no external tool demo.', status: 'draft' },
  { id: 'geoffy-monitor', name: 'Geoffy Monitor', kind: 'vendor-claim', job: 'Monitor', intendedRole: 'Vendor describes scheduled questions and recording named brands/sources.', url: 'https://geoffy.ai/', sourceId: 'geoffy-official', caveat: 'Vendor claim; Monitor is labelled early access on the vendor site. Methodology and permissions need confirmation.', demoPermission: 'Not confirmed.', status: 'unverified' },
  { id: 'geoffy-optimise', name: 'Geoffy Optimise', kind: 'vendor-claim', job: 'Improve', intendedRole: 'Vendor describes product-page content and structured-data work based on a store catalogue.', url: 'https://geoffy.ai/how-it-works', sourceId: 'geoffy-official', caveat: 'Vendor claim; product support, exact features and current availability need confirmation.', demoPermission: 'Not confirmed.', status: 'unverified' },
  { id: 'admultify', name: 'AdMultify', kind: 'vendor-claim', job: 'Improve', intendedRole: 'Vendor describes generating ad-creative variations from supplied key visuals/assets.', url: 'https://begen.ai/', sourceId: 'admultify-official', caveat: 'This is ad creative production, not a product-visibility monitor or recommendation-placement tool.', demoPermission: 'Not confirmed.', status: 'unverified' },
  { id: 'rierino', name: 'Rierino Commerce', kind: 'vendor-claim', job: 'Improve', intendedRole: 'Vendor describes commerce platform and backend/agent operations across commerce models.', url: 'https://rierino.com/solutions/commerce', sourceId: 'rierino-commerce', caveat: 'Platform/operations role, not an observation or diagnostic tool. No Commonwork integration is claimed.', demoPermission: 'Not confirmed.', status: 'unverified' },
];

export const resources: Resource[] = [
  { label: 'OpenAI Shopping Research', note: 'Official English description of clarifying questions, research, comparison and retailer click-through.', url: 'https://openai.com/en-US/index/chatgpt-shopping-research/', sourceId: 'openai-shopping-research', status: 'source-backed' },
  { label: 'OpenAI Product Discovery', note: 'Official description of visual results, comparisons and merchant product data.', url: 'https://openai.com/index/powering-product-discovery-in-chatgpt/', sourceId: 'openai-shopping-discovery', status: 'source-backed' },
  { label: 'Google Product structured data', note: 'Google Search product snippets and merchant listings; not a guarantee of display.', url: 'https://developers.google.com/search/docs/appearance/structured-data/product', sourceId: 'google-product-structured-data', status: 'source-backed' },
  { label: 'Google Merchant Center product data', note: 'Destination-specific product and offer data requirements.', url: 'https://support.google.com/merchants/answer/7052112', sourceId: 'google-merchant-spec', status: 'source-backed' },
];

export const contactPlaceholder = {
  heading: 'Optional: talk with Commonwork',
  body: 'Draft placeholder. No public commercial-enquiry route has been approved, so no contact link is shown.',
};