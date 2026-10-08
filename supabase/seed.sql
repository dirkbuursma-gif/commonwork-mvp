begin;

insert into public.provider_categories (slug, name, what_it_is, what_it_is_not, sort_order, is_seed_data, seed_batch)
values
  ('agentic-commerce', 'Agentic Commerce', 'Commerce capabilities that help systems represent products, connect workflows and take bounded action with appropriate controls.', 'A readiness badge, a single platform feature or proof that autonomous buying is dependable in every context.', 1, true, 'commonwork-intelligence-v1'),
  ('commerce-platforms', 'Commerce Platforms', 'Transactional and operational systems for catalogues, pricing, promotions, carts, checkout and commerce workflows.', 'A complete commerce architecture by itself; fit depends on adjacent data, integrations, fulfilment and operating capabilities.', 2, true, 'commonwork-intelligence-v1'),
  ('product-data-enrichment', 'Product Data & Enrichment', 'Capabilities that structure, govern, enrich and distribute product content for people, channels and machine-readable discovery.', 'A guarantee of discoverability or conversion; source quality, governance and distribution still matter.', 3, true, 'commonwork-intelligence-v1'),
  ('contact-centre-service-automation', 'Contact Centre & Service Automation', 'Customer-service platforms and automation that support agents, resolve bounded requests and connect service activity to commerce operations.', 'Unsupervised replacement of service teams; escalation, policy and operational ownership remain essential.', 4, true, 'commonwork-intelligence-v1')
on conflict (slug) do update set
  name = excluded.name,
  what_it_is = excluded.what_it_is,
  what_it_is_not = excluded.what_it_is_not,
  sort_order = excluded.sort_order,
  is_seed_data = excluded.is_seed_data,
  seed_batch = excluded.seed_batch;

insert into public.providers (
  slug, name, website_url, summary, source_system, source_record_id, source_url,
  imported_at, reviewed_at, reviewed_by, is_seed_data, seed_batch
)
values
  ('begen', 'Begen', 'https://www.begen.ai', 'Provider of AdMultify creative automation.', 'cp-provider-export-2026-09-02', 'begen', 'https://www.begen.ai', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('benext', 'Benext', 'https://www.benext.com', 'Provider of Be.cited generative-search visibility capabilities.', 'cp-provider-export-2026-09-02', 'benext', 'https://www.benext.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('bloomreach', 'Bloomreach', 'https://www.bloomreach.com', 'Commerce experience, discovery and engagement products.', 'cp-provider-export-2026-09-02', 'bloomreach-discovery', 'https://www.bloomreach.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('adobe', 'Adobe', 'https://www.adobe.com', 'Commerce and digital-asset capabilities within the Adobe product ecosystem.', 'cp-provider-export-2026-09-02', 'adobe-commerce-magento', 'https://www.adobe.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('kibo', 'Kibo', 'https://kibocommerce.com', 'Composable commerce and order-management products.', 'cp-provider-export-2026-09-02', 'kibo-commerce', 'https://kibocommerce.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('salesforce', 'Salesforce', 'https://www.salesforce.com', 'Commerce, personalization, order-management and customer-service products.', 'cp-provider-export-2026-09-02', 'salesforce', 'https://www.salesforce.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('rierino', 'Rierino', 'https://www.rierino.com', 'Commerce orchestration and product-information capabilities.', 'cp-provider-export-2026-09-02', 'rierino', 'https://www.rierino.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('vtex', 'VTEX', 'https://vtex.com', 'Connected commerce suite spanning digital commerce, B2B, marketplace, order management and headless storefront options.', 'cp-provider-export-2026-09-02', 'vtex', 'https://vtex.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('informatica', 'Informatica', 'https://www.informatica.com', 'Enterprise data-management and product-information capabilities.', 'cp-provider-export-2026-09-02', 'informatica', 'https://www.informatica.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('catsy', 'Catsy', 'https://www.catsy.com', 'Product information and digital-asset management capabilities.', 'cp-provider-export-2026-09-02', 'catsy', 'https://www.catsy.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('telus-international', 'TELUS International', 'https://www.telusinternational.com', 'Customer experience and service operations.', 'cp-provider-export-2026-09-02', 'telus-international', 'https://www.telusinternational.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('genesys', 'Genesys', 'https://www.genesys.com', 'Customer experience platform and contact-centre capabilities.', 'cp-provider-export-2026-09-02', 'genesys-cloud', 'https://www.genesys.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('zendesk', 'Zendesk', 'https://www.zendesk.com', 'Customer-service platform and support workflows.', 'cp-provider-export-2026-09-02', 'zendesk', 'https://www.zendesk.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1')
on conflict (source_system, source_record_id) do update set
  slug = excluded.slug,
  name = excluded.name,
  website_url = excluded.website_url,
  summary = excluded.summary,
  source_url = excluded.source_url,
  imported_at = excluded.imported_at,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  is_seed_data = excluded.is_seed_data,
  seed_batch = excluded.seed_batch;

insert into public.provider_products (
  provider_id, slug, name, summary, operating_layer, contribution_role, evidence_maturity,
  merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture,
  deployment_model, capabilities_summary, source_system, source_record_id, source_url,
  imported_at, reviewed_at, reviewed_by, is_seed_data, seed_batch
)
select
  p.id, s.slug, s.name, s.summary, s.operating_layer, s.contribution_role, s.evidence_maturity,
  s.merchant_fit, s.boundary_and_dependencies, s.buyer_validation_questions, s.architecture,
  s.deployment_model, s.capabilities_summary, 'cp-platform-catalogue-2026-10-07', s.source_record_id,
  s.source_url, '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z',
  'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'
from (values
  ('begen', 'begen', 'begen', 'AI-agent and conversational experience services for web, messaging and voice channels.', 'AI agent development', 'Cross-stack orchestration layer', 'Claimed', array['Retailers exploring bounded conversational workflows'], 'Validate data ownership, escalation paths, permissions, integrations and human oversight.', array['Which business system owns the source-of-truth data this product depends on?', 'What controls govern hand-off when the agent is uncertain?'], 'LLM-based assistant services', 'Services / implementation', 'Agent design, build and operation', 'plat-b6udqv7u0', 'https://www.begen.ai'),
  ('begen', 'admultify', 'AdMultify', 'AI creative automation that generates and adapts campaign assets from a key visual.', 'AI creative', 'Commercial-meaning foundation', 'Claimed', array['Retailers and brands producing campaign variants'], 'Validate rights, review workflows, source assets and distribution destinations.', array['How are asset rights and brand rules enforced?', 'What human approval is required before publication?'], 'Creative automation', 'SaaS', 'Static and video creative variants; campaign workflows', 'plat-admultify', 'https://www.begen.ai'),
  ('benext', 'benext-ai', 'Benext AI', 'AI agent and conversational experience development services across web, messaging and voice.', 'AI agent development', 'Cross-stack orchestration layer', 'Claimed', array['Teams exploring bounded AI-assisted service workflows'], 'Validate platform scope, data access, integrations, hand-off and ongoing operational ownership.', array['Which systems can the agent read or change?', 'How are permissions and exceptions tested?'], 'LLM-based assistant services', 'Services / implementation', 'Agent and conversational experience development', 'plat-benext-ai', 'https://www.benext.com'),
  ('benext', 'be-cited', 'Be.cited', 'Generative-search visibility monitoring, citation tracking and human-led content improvement.', 'Discovery and visibility', 'Discovery foundation', 'Documented', array['Brands assessing product visibility in generative search'], 'Monitoring is not a guarantee of ranking; validate source coverage and recommendations.', array['Which sources and answer surfaces are measured?', 'Can recommendations be traced to verifiable evidence?'], 'Generative-search analytics', 'SaaS', 'Visibility monitoring, citations and content audits', 'plat-becited', 'https://www.benext.com'),
  ('bloomreach', 'bloomreach-discovery', 'Bloomreach Discovery', 'E-commerce search, merchandising, category navigation and product recommendations.', 'Search and discovery', 'Discovery foundation', 'Documented', array['Retailers with governed catalogues and measurable search journeys'], 'Results depend on catalogue quality, index freshness and ranking governance.', array['How are product attributes normalized?', 'How are ranking changes measured and reviewed?'], 'Search and recommendation platform', 'SaaS', 'Search, merchandising, recommendations and analytics', 'plat-bloomreach-discovery', 'https://www.bloomreach.com/en/products/discovery'),
  ('adobe', 'adobe-commerce', 'Adobe Commerce', 'Commerce platform for catalogue, checkout, promotions, APIs and extensible workflows.', 'Commerce platform', 'Cross-stack orchestration layer', 'Documented', array['Enterprise and complex B2B/B2C commerce'], 'Qualify licensing, deployment, integrations, implementation capacity and operating cost.', array['Which extensions are essential?', 'How are upgrades and customizations governed?'], 'Extensible commerce platform', 'Cloud / self-managed options', 'B2B, B2C, catalogue, checkout and APIs', 'plat-8g0v6t0dk', 'https://business.adobe.com/products/commerce/magento.html'),
  ('adobe', 'adobe-experience-manager-assets', 'Adobe Experience Manager Assets', 'Digital asset management for rights, workflows, metadata and asset delivery.', 'Digital asset management', 'Commercial-meaning foundation', 'Documented', array['Large multi-brand organizations with governed asset workflows'], 'Distinct from product information management; validate rights and delivery integrations.', array['How are asset rights represented?', 'Which channels receive approved renditions?'], 'Digital asset management', 'Enterprise SaaS', 'Asset lifecycle, metadata, rights and dynamic delivery', 'plat-adobe-experience-manager-assets', 'https://business.adobe.com/products/experience-manager/assets/aem-assets.html'),
  ('kibo', 'kibo-commerce', 'Kibo Commerce', 'Composable commerce platform for catalogue, checkout, orders and multi-market operations.', 'Commerce platform', 'Cross-stack orchestration layer', 'Documented', array['Mid-market teams seeking modular commerce'], 'Validate North American operating fit, implementation scope and integration ownership.', array['Which commerce functions remain outside the platform?', 'What is the operating model for extensions?'], 'Composable commerce platform', 'SaaS', 'Catalogue, checkout, orders and integrations', 'plat-zsc42vx3o', 'https://kibocommerce.com'),
  ('vtex', 'vtex-commerce-platform', 'VTEX Commerce Platform', 'Connected commerce suite for digital commerce, B2B, marketplace and seller management, order management, headless storefronts and APIs.', 'Commerce platform', 'Integrated commerce suite with modular extension', 'Documented', array['Enterprise brands and retailers needing B2C, B2B and marketplace functionality in one capability set'], 'Validate operating geography and local ecosystem, B2B depth, marketplace governance, integration limits and the GMV-based cost model at scale.', array['Which marketplace, seller and B2B requirements does the suite cover natively?', 'Where are the integration and API limits, and who owns extensions?', 'How does cost develop as GMV grows?'], 'Cloud SaaS; connected commerce with pragmatic composability', 'Cloud SaaS', 'Digital commerce, B2B, marketplace and seller management, OMS, headless storefront options, APIs and omnichannel capability', 'plat-czu1ajo74', 'https://vtex.com/en-us/vtex-io/'),
  ('kibo', 'kibo-order-management', 'Kibo Order Management', 'Order management capabilities connecting inventory, sourcing and fulfilment decisions.', 'Order management', 'Operational-truth foundation', 'Claimed', array['Retailers coordinating inventory and fulfilment across channels'], 'Validate dependency on commerce, ERP, inventory and carrier systems.', array['How are inventory sources reconciled?', 'How are exception and split-order decisions controlled?'], 'Order management system', 'SaaS', 'Order orchestration and fulfilment workflows', 'plat-kibo-order-management', 'https://kibocommerce.com'),
  ('salesforce', 'salesforce-commerce-cloud', 'Salesforce Commerce Cloud', 'Enterprise commerce suite for catalogue, checkout and multi-channel transactions.', 'Commerce platform', 'Cross-stack orchestration layer', 'Documented', array['Enterprise teams using Salesforce commerce and customer systems'], 'Qualify licensing, integration boundaries, extensibility and implementation complexity.', array['Which customer and product data is authoritative?', 'How are extensions and releases governed?'], 'Enterprise commerce platform', 'SaaS', 'B2B/B2C commerce, catalogue, checkout and APIs', 'plat-6ukswb758', 'https://www.salesforce.com/commerce/'),
  ('salesforce', 'salesforce-personalization', 'Salesforce Personalization', 'Real-time customer personalization across Salesforce commerce and marketing touchpoints.', 'Personalization', 'Discovery foundation', 'Documented', array['Teams with consented customer data and measurable journeys'], 'Fit depends on identity, consent, source data and the Salesforce operating environment.', array['Which consent state governs activation?', 'How are audience rules audited?'], 'Customer data and personalization', 'Cloud service', 'Segmentation, personalization and journey activation', 'plat-salesforce-personalization', 'https://www.salesforce.com/marketing/personalization/'),
  ('salesforce', 'salesforce-order-management', 'Salesforce Order Management', 'Cloud order management connecting inventory and orders across regions.', 'Order management', 'Operational-truth foundation', 'Documented', array['B2B/B2C organizations operating across Salesforce commerce'], 'Validate ERP, warehouse and inventory ownership and exception handling.', array['How are split orders and cancellations handled?', 'What is the latency of inventory updates?'], 'Order management system', 'Cloud service', 'Order orchestration and inventory coordination', 'plat-salesforce-order-management', 'https://www.salesforce.com/products/order-management/'),
  ('salesforce', 'salesforce-service-cloud', 'Salesforce Service Cloud', 'Customer service platform for case management, service workflows and agent support.', 'Customer service', 'Cross-stack orchestration layer', 'Claimed', array['Teams already operating Salesforce service workflows'], 'Assess integration scope, service policy, escalation and agent permissions.', array['What can automation resolve without agent approval?', 'How are hand-offs and audit trails preserved?'], 'Customer service platform', 'Cloud service', 'Case management, service operations and integrations', 'plat-salesforce-service-cloud', 'https://www.salesforce.com/products/service-cloud/'),
  ('rierino', 'rierino-commerce-platform', 'Rierino Commerce Platform', 'Commerce orchestration and application capabilities across connected systems.', 'Commerce platform', 'Cross-stack orchestration layer', 'Documented', array['Organizations coordinating commerce processes across systems'], 'Validate implementation scope, integration ownership and operating dependencies.', array['Which business rules are centralized?', 'How are system boundaries and failures handled?'], 'Composable commerce platform', 'Cloud / hybrid options', 'Commerce workflows and cross-stack orchestration', 'plat-rierino', 'https://www.rierino.com'),
  ('rierino', 'rierino', 'Rierino', 'Product information capabilities within Rierino’s broader commerce platform.', 'Product information', 'Commercial-meaning foundation', 'Claimed', array['Teams evaluating product data within a broader orchestration stack'], 'Validate whether the PIM scope replaces or complements existing PIM/MDM systems.', array['Which system is authoritative for product attributes?', 'How are channel-specific enrichments governed?'], 'Product information management', 'Cloud / hybrid options', 'Product data and commerce integration', 'plat-wbbcye6mt', 'https://www.rierino.com'),
  ('informatica', 'informatica-product-360', 'Informatica Product 360', 'Enterprise product information and master data management for multi-channel operations.', 'Product information', 'Commercial-meaning foundation', 'Documented', array['Global multi-channel organizations with complex data governance'], 'Assess data-model complexity, integration effort and stewardship operating model.', array['How are golden records and exceptions governed?', 'What source systems and channel syndication are included?'], 'PIM / MDM', 'Enterprise cloud', 'Product data centralization, governance and publishing', 'plat-informatica', 'https://www.informatica.com'),
  ('catsy', 'catsy-pim-dam', 'Catsy PIM & DAM', 'Product content and media management with publishing workflows and syndication.', 'Product information and assets', 'Commercial-meaning foundation', 'Documented', array['Manufacturers and distributors coordinating product content and media'], 'Validate data-model depth, localization, channel destinations and integration scope.', array['How are product and asset records connected?', 'How are approvals and channel outputs audited?'], 'PIM and DAM', 'Cloud service', 'Product data, media, publishing workflows and syndication', 'plat-catsy', 'https://www.catsy.com'),
  ('telus-international', 'telus-international', 'TELUS International', 'Customer experience and service operations across global delivery locations.', 'Customer service', 'Operational-truth foundation', 'Claimed', array['Organizations with regional language and service-operations requirements'], 'Validate service scope, data handling, escalation, staffing and regional coverage.', array['Which service decisions are automated?', 'What controls and escalation paths are in place?'], 'Customer experience operations', 'Managed service', 'Customer support and service operations', 'plat-telus-international', 'https://www.telusinternational.com'),
  ('genesys', 'genesys-cloud', 'Genesys Cloud', 'Contact-centre platform for omnichannel customer journeys and service workflows.', 'Contact centre', 'Operational-truth foundation', 'Documented', array['Large service operations requiring omnichannel routing and analytics'], 'Validate region, integration, call-flow governance and AI oversight.', array['How are routing and escalation decisions governed?', 'What data retention and audit controls apply?'], 'Contact-centre platform', 'Cloud service', 'Omnichannel service, routing and analytics', 'plat-genesys-cloud', 'https://www.genesys.com'),
  ('zendesk', 'zendesk', 'Zendesk', 'Customer-service platform for support workflows, knowledge and marketplace integrations.', 'Customer service', 'Operational-truth foundation', 'Claimed', array['SMB and mid-market service teams needing adaptable support workflows'], 'Validate integration governance, automation permissions and knowledge ownership.', array['What can automations change or communicate?', 'How are marketplace integrations reviewed?'], 'Customer-service platform', 'SaaS', 'Support workflows, APIs and marketplace apps', 'plat-zendesk', 'https://www.zendesk.com')
) as s(provider_slug, slug, name, summary, operating_layer, contribution_role, evidence_maturity,
        merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture,
        deployment_model, capabilities_summary, source_record_id, source_url)
join public.providers p on p.slug = s.provider_slug
on conflict (source_system, source_record_id) do update set
  provider_id = excluded.provider_id,
  slug = excluded.slug,
  name = excluded.name,
  summary = excluded.summary,
  operating_layer = excluded.operating_layer,
  contribution_role = excluded.contribution_role,
  evidence_maturity = excluded.evidence_maturity,
  merchant_fit = excluded.merchant_fit,
  boundary_and_dependencies = excluded.boundary_and_dependencies,
  buyer_validation_questions = excluded.buyer_validation_questions,
  architecture = excluded.architecture,
  deployment_model = excluded.deployment_model,
  capabilities_summary = excluded.capabilities_summary,
  source_url = excluded.source_url,
  imported_at = excluded.imported_at,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  is_seed_data = excluded.is_seed_data,
  seed_batch = excluded.seed_batch;

-- Geoffy comes from its own partner intake (self-submitted, 2026-09-14), not the catalogue export.
insert into public.providers (
  slug, name, website_url, summary, source_system, source_record_id, source_url,
  imported_at, reviewed_at, reviewed_by, is_seed_data, seed_batch
)
values (
  'geoffy', 'Geoffy', 'https://geoffy.ai',
  'Provider of a GEO (generative engine optimisation) platform that makes e-commerce product data readable and citable by AI shopping assistants.',
  'cp-partner-intake-2026-09-14', 'geoffy', 'https://geoffy.ai',
  '2026-09-14T00:00:00Z', '2026-10-08T00:00:00Z', 'Commerce Partners partner intake review',
  true, 'commonwork-intelligence-v1'
)
on conflict (source_system, source_record_id) do update set
  slug = excluded.slug,
  name = excluded.name,
  website_url = excluded.website_url,
  summary = excluded.summary,
  source_url = excluded.source_url,
  imported_at = excluded.imported_at,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  is_seed_data = excluded.is_seed_data,
  seed_batch = excluded.seed_batch;

insert into public.provider_products (
  provider_id, slug, name, summary, operating_layer, contribution_role, evidence_maturity,
  merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture,
  deployment_model, capabilities_summary, source_system, source_record_id, source_url,
  imported_at, reviewed_at, reviewed_by, is_seed_data, seed_batch
)
select
  p.id, 'geoffy', 'Geoffy',
  'GEO platform for e-commerce that restructures product data so AI assistants such as ChatGPT, Perplexity, Gemini and Google AI Overviews can find, understand and cite products, then measures the result.',
  'AI product discoverability', 'Machine-readable product-data layer', 'Claimed',
  array['Shopify or WooCommerce merchants with roughly 250 to 5,000 products in considered-purchase categories'],
  'Sits alongside the existing SEO stack, agency and CMS; it does not replace them. Improves the odds of being cited but cannot guarantee placement in AI answers. Needs admin access to a Shopify or WordPress store and reasonably complete product data.',
  array['How is AI-referred traffic measured today, and which baseline will the trial use?', 'Which product attributes and comparison context does Geoffy generate, and who approves them?', 'How does it coexist with the current schema, SEO and feed tooling?'],
  'Point solution on top of the storefront and catalogue',
  'Shopify app, WooCommerce plugin and headless package (Next.js, Astro)',
  'AI visibility audit, product-data structuring for answer engines, and monitoring of citations and AI-referred traffic.',
  'cp-partner-intake-2026-09-14', 'geoffy', 'https://geoffy.ai',
  '2026-09-14T00:00:00Z', '2026-10-08T00:00:00Z', 'Commerce Partners partner intake review',
  true, 'commonwork-intelligence-v1'
from public.providers p
where p.slug = 'geoffy'
on conflict (source_system, source_record_id) do update set
  provider_id = excluded.provider_id,
  slug = excluded.slug,
  name = excluded.name,
  summary = excluded.summary,
  operating_layer = excluded.operating_layer,
  contribution_role = excluded.contribution_role,
  evidence_maturity = excluded.evidence_maturity,
  merchant_fit = excluded.merchant_fit,
  boundary_and_dependencies = excluded.boundary_and_dependencies,
  buyer_validation_questions = excluded.buyer_validation_questions,
  architecture = excluded.architecture,
  deployment_model = excluded.deployment_model,
  capabilities_summary = excluded.capabilities_summary,
  source_url = excluded.source_url,
  imported_at = excluded.imported_at,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  is_seed_data = excluded.is_seed_data,
  seed_batch = excluded.seed_batch;

delete from public.provider_links l
using public.provider_products pp
where l.provider_product_id = pp.id
  and pp.is_seed_data
  and pp.seed_batch = 'commonwork-intelligence-v1';

delete from public.provider_category_memberships m
using public.provider_products pp
where m.provider_product_id = pp.id
  and pp.slug in ('begen', 'benext-ai');

insert into public.provider_category_memberships (provider_product_id, category_id, fit_summary, sort_order)
select pp.id, pc.id, s.fit_summary, s.sort_order
from (values
  ('admultify', 'agentic-commerce', 'Creative automation; review rights, brand controls and channel approval.', 2),
  ('be-cited', 'agentic-commerce', 'Generative-search visibility; treat monitoring as evidence, not a ranking guarantee.', 4),
  ('geoffy', 'agentic-commerce', 'Makes product data legible to AI shopping assistants; treat it as improving the odds, not guaranteeing placement.', 3),
  ('bloomreach-discovery', 'agentic-commerce', 'Discovery capabilities that depend on governed catalogues and ranking controls.', 5),
  ('salesforce-personalization', 'agentic-commerce', 'Personalized experiences depend on consented identity and source data.', 6),
  ('adobe-commerce', 'commerce-platforms', 'Enterprise commerce suite; qualify complexity, licensing and extension model.', 1),
  ('kibo-commerce', 'commerce-platforms', 'Composable commerce; map which functions remain outside the platform.', 2),
  ('kibo-order-management', 'commerce-platforms', 'Order orchestration; validate inventory and fulfilment boundaries.', 3),
  ('salesforce-commerce-cloud', 'commerce-platforms', 'Enterprise commerce in a broader Salesforce operating environment.', 4),
  ('salesforce-order-management', 'commerce-platforms', 'Order and inventory coordination across regions and systems.', 5),
  ('rierino-commerce-platform', 'commerce-platforms', 'Cross-stack commerce orchestration; clarify system and operating ownership.', 6),
  ('vtex-commerce-platform', 'commerce-platforms', 'Integrated enterprise suite with marketplace, B2B and order management; qualify geography, governance and cost model.', 7),
  ('adobe-experience-manager-assets', 'product-data-enrichment', 'Digital assets and rights; complementary to, not synonymous with, PIM.', 1),
  ('rierino', 'product-data-enrichment', 'Product information capabilities within a broader commerce platform.', 2),
  ('geoffy', 'product-data-enrichment', 'Restructures existing product data for machine-readable discovery; depends on source catalogue quality.', 5),
  ('informatica-product-360', 'product-data-enrichment', 'Enterprise PIM/MDM; assess stewardship and integration capacity.', 3),
  ('catsy-pim-dam', 'product-data-enrichment', 'Product content and media management with publishing workflows.', 4),
  ('salesforce-service-cloud', 'contact-centre-service-automation', 'Service workflows; validate automation permissions and escalation.', 1),
  ('telus-international', 'contact-centre-service-automation', 'Managed service operations; validate regions and service boundaries.', 2),
  ('genesys-cloud', 'contact-centre-service-automation', 'Omnichannel contact-centre platform; validate routing and audit controls.', 3),
  ('zendesk', 'contact-centre-service-automation', 'Support workflows; review automation and marketplace integration controls.', 4)
) as s(product_slug, category_slug, fit_summary, sort_order)
join public.provider_products pp on pp.slug = s.product_slug
join public.provider_categories pc on pc.slug = s.category_slug
on conflict (provider_product_id, category_id) do update set
  fit_summary = excluded.fit_summary,
  sort_order = excluded.sort_order;

insert into public.provider_links (provider_product_id, link_type, label, url, sort_order)
select pp.id, 'official', 'Official product information', s.url, 1
from (values
  ('admultify', 'https://www.begen.ai'),
  ('be-cited', 'https://www.benext.com'),
  ('geoffy', 'https://geoffy.ai'),
  ('bloomreach-discovery', 'https://www.bloomreach.com/en/products/discovery'),
  ('adobe-commerce', 'https://business.adobe.com/products/commerce/magento.html'),
  ('adobe-experience-manager-assets', 'https://business.adobe.com/products/experience-manager/assets/aem-assets.html'),
  ('kibo-commerce', 'https://kibocommerce.com'),
  ('kibo-order-management', 'https://kibocommerce.com'),
  ('salesforce-commerce-cloud', 'https://www.salesforce.com/commerce/'),
  ('salesforce-personalization', 'https://www.salesforce.com/marketing/personalization/'),
  ('salesforce-order-management', 'https://www.salesforce.com/products/order-management/'),
  ('salesforce-service-cloud', 'https://www.salesforce.com/products/service-cloud/'),
  ('rierino-commerce-platform', 'https://www.rierino.com'),
  ('rierino', 'https://www.rierino.com'),
  ('vtex-commerce-platform', 'https://vtex.com/en-us/vtex-io/'),
  ('informatica-product-360', 'https://www.informatica.com'),
  ('catsy-pim-dam', 'https://www.catsy.com'),
  ('telus-international', 'https://www.telusinternational.com'),
  ('genesys-cloud', 'https://www.genesys.com'),
  ('zendesk', 'https://www.zendesk.com')
) as s(product_slug, url)
join public.provider_products pp on pp.slug = s.product_slug;

delete from public.category_competency_links
where is_seed_data = true and seed_batch = 'commonwork-intelligence-v1';

insert into public.category_competency_links (
  category_id, competency_id, relationship_type, relevance_note, sort_order, is_seed_data, seed_batch
)
select pc.id, c.id, s.relationship_type, s.relevance_note, s.sort_order,
  true, 'commonwork-intelligence-v1'
from (values
  ('agentic-commerce', 'ai-agent-governance', 'expertise', 'Permissions, oversight and accountability for bounded agent actions.', 1),
  ('agentic-commerce', 'commerce-architecture', 'related', 'Commerce system boundaries and dependencies shape safe agent capability.', 2),
  ('commerce-platforms', 'commerce-platforms', 'expertise', 'Platform capabilities and operating models.', 1),
  ('commerce-platforms', 'vendor-evaluation', 'related', 'Compare documented fit, constraints and implementation trade-offs.', 2),
  ('product-data-enrichment', 'product-information-management', 'expertise', 'Ownership and publishing of structured product information.', 1),
  ('product-data-enrichment', 'product-data-quality', 'common_need', 'Data completeness and consistency shape downstream product use.', 2),
  ('contact-centre-service-automation', 'customer-experience', 'expertise', 'Customer service journeys and experience operations.', 1),
  ('contact-centre-service-automation', 'workflow-automation', 'related', 'Bounded automation with escalation and exception handling.', 2)
) as s(category_slug, competency_slug, relationship_type, relevance_note, sort_order)
join public.provider_categories pc on pc.slug = s.category_slug
join public.competencies c on c.slug = s.competency_slug and c.status = 'active'
on conflict (category_id, competency_id) do update set
  relationship_type = excluded.relationship_type,
  relevance_note = excluded.relevance_note,
  sort_order = excluded.sort_order,
  is_seed_data = true,
  seed_batch = 'commonwork-intelligence-v1';

insert into public.provider_publication_status (provider_id, status, public_disclosure_note, published_at)
select p.id, 'published', 'Local demo copy of a public Commerce Partners catalogue profile. Not a certification or endorsement.', '2026-10-07T00:00:00Z'
from public.providers p
where p.is_seed_data and p.seed_batch = 'commonwork-intelligence-v1'
on conflict (provider_id) where provider_id is not null do update set
  status = excluded.status,
  public_disclosure_note = excluded.public_disclosure_note,
  published_at = excluded.published_at,
  retired_at = null,
  retired_by = null;

insert into public.provider_publication_status (provider_product_id, status, public_disclosure_note, published_at, retired_at)
select pp.id,
  case when pp.slug in ('begen', 'benext-ai') then 'retired' else 'published' end,
  case when pp.slug in ('begen', 'benext-ai')
    then 'Retired: Begen is represented by AdMultify and Benext by Be.cited.'
    else 'Local demo copy of a public Commerce Partners catalogue profile. Confirm current fit, evidence and dependencies before relying on it.'
  end,
  '2026-10-07T00:00:00Z',
  case when pp.slug in ('begen', 'benext-ai') then now() end
from public.provider_products pp
where pp.is_seed_data and pp.seed_batch = 'commonwork-intelligence-v1'
on conflict (provider_product_id) where provider_product_id is not null do update set
  status = excluded.status,
  public_disclosure_note = excluded.public_disclosure_note,
  published_at = excluded.published_at,
  retired_at = excluded.retired_at,
  retired_by = null;

commit;
delete from public.product_competency_links
where is_seed_data = true and seed_batch = 'commonwork-intelligence-v1';

insert into public.product_competency_links (
  provider_product_id, competency_id, relationship_type, relevance_note, is_seed_data, seed_batch
)
select pp.id, c.id, s.relationship_type, s.relevance_note, true, 'commonwork-intelligence-v1'
from (values
  ('adobe-commerce', 'commerce-platforms', 'expertise', 'Enterprise commerce platform capability.'),
  ('adobe-commerce', 'replatforming-strategy', 'related', 'Migration scope and extension model shape the move.'),
  ('kibo-commerce', 'commerce-platforms', 'expertise', 'Composable commerce platform capability.'),
  ('kibo-commerce', 'composable-commerce', 'expertise', 'Composable architecture and boundary decisions.'),
  ('kibo-order-management', 'commerce-architecture', 'related', 'Order orchestration sits across inventory and fulfilment boundaries.'),
  ('salesforce-commerce-cloud', 'commerce-platforms', 'expertise', 'Enterprise commerce within the Salesforce environment.'),
  ('salesforce-commerce-cloud', 'platform-assessment', 'related', 'Qualify licensing, extension model and dependencies.'),
  ('salesforce-order-management', 'systems-integration', 'related', 'Order data flows across commerce and service systems.'),
  ('rierino-commerce-platform', 'composable-commerce', 'expertise', 'Composable, API-led commerce capability.'),
  ('rierino-commerce-platform', 'commerce-architecture', 'related', 'Architecture and integration pattern fit.'),
  ('vtex-commerce-platform', 'commerce-platforms', 'expertise', 'Integrated enterprise commerce platform capability.'),
  ('vtex-commerce-platform', 'composable-commerce', 'related', 'Connected suite with modular, headless and API extension options.'),
  ('vtex-commerce-platform', 'platform-assessment', 'related', 'Qualify geography, marketplace governance, integration limits and cost model.'),
  ('informatica-product-360', 'product-information-management', 'expertise', 'Product information governance and mastering.'),
  ('informatica-product-360', 'product-data-quality', 'common_need', 'Data completeness and consistency controls.'),
  ('catsy-pim-dam', 'product-information-management', 'expertise', 'PIM and DAM for product content.'),
  ('catsy-pim-dam', 'product-data-enrichment', 'expertise', 'Enrichment and channel distribution.'),
  ('adobe-experience-manager-assets', 'product-data-enrichment', 'related', 'Asset management supports product content enrichment.'),
  ('admultify', 'agentic-commerce', 'related', 'Creative automation; validate rights, brand controls and approval.'),
  ('be-cited', 'agentic-commerce', 'related', 'Generative-search visibility; validate sources and evidence.'),
  ('geoffy', 'agentic-commerce', 'related', 'Product data prepared for AI shopping assistants; validate sources and measurement.'),
  ('geoffy', 'product-data-enrichment', 'expertise', 'Structures and enriches product data for answer engines.'),
  ('geoffy', 'product-data-quality', 'common_need', 'Needs a reasonably complete catalogue as input.'),
  ('bloomreach-discovery', 'product-discovery-optimization', 'expertise', 'Search and discovery capability.'),
  ('salesforce-personalization', 'customer-experience', 'related', 'Personalization depends on consented identity data.'),
  ('genesys-cloud', 'customer-experience', 'expertise', 'Contact-centre journeys and routing.'),
  ('genesys-cloud', 'workflow-automation', 'related', 'Bounded service automation.'),
  ('zendesk', 'customer-experience', 'expertise', 'Service operations platform.'),
  ('zendesk', 'human-centered-automation', 'related', 'Automation with agent oversight.'),
  ('salesforce-service-cloud', 'workflow-automation', 'related', 'Service workflow automation.'),
  ('telus-international', 'human-centered-automation', 'related', 'Service delivery with human oversight.')
) as s(product_slug, competency_slug, relationship_type, relevance_note)
join public.provider_products pp on pp.slug = s.product_slug
join public.competencies c on c.slug = s.competency_slug and c.status = 'active'
on conflict (provider_product_id, competency_id) do nothing;
