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
  ('begen', 'Begen', 'https://www.begen.ai', 'Provider of AdMultify creative automation and Begen AI capabilities.', 'cp-provider-export-2026-09-02', 'begen', 'https://www.begen.ai', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('benext', 'Benext', 'https://www.benext.com', 'Provider of Benext AI services and Be.cited generative-search visibility capabilities.', 'cp-provider-export-2026-09-02', 'benext', 'https://www.benext.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('bloomreach', 'Bloomreach', 'https://www.bloomreach.com', 'Commerce experience, discovery and engagement products.', 'cp-provider-export-2026-09-02', 'bloomreach-discovery', 'https://www.bloomreach.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('adobe', 'Adobe', 'https://www.adobe.com', 'Commerce and digital-asset capabilities within the Adobe product ecosystem.', 'cp-provider-export-2026-09-02', 'adobe-commerce-magento', 'https://www.adobe.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('kibo', 'Kibo', 'https://kibocommerce.com', 'Composable commerce and order-management products.', 'cp-provider-export-2026-09-02', 'kibo-commerce', 'https://kibocommerce.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('salesforce', 'Salesforce', 'https://www.salesforce.com', 'Commerce, personalization, order-management and customer-service products.', 'cp-provider-export-2026-09-02', 'salesforce', 'https://www.salesforce.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
  ('rierino', 'Rierino', 'https://www.rierino.com', 'Commerce orchestration and product-information capabilities.', 'cp-provider-export-2026-09-02', 'rierino', 'https://www.rierino.com', '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z', 'Commerce Partners public catalogue review', true, 'commonwork-intelligence-v1'),
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

delete from public.provider_links l
using public.provider_products pp
where l.provider_product_id = pp.id
  and pp.is_seed_data
  and pp.seed_batch = 'commonwork-intelligence-v1';

insert into public.provider_category_memberships (provider_product_id, category_id, fit_summary, sort_order)
select pp.id, pc.id, s.fit_summary, s.sort_order
from (values
  ('begen', 'agentic-commerce', 'AI agent development; validate permissions, escalation and operational control.', 1),
  ('admultify', 'agentic-commerce', 'Creative automation; review rights, brand controls and channel approval.', 2),
  ('benext-ai', 'agentic-commerce', 'Conversational and agent services; validate hand-off and system permissions.', 3),
  ('be-cited', 'agentic-commerce', 'Generative-search visibility; treat monitoring as evidence, not a ranking guarantee.', 4),
  ('bloomreach-discovery', 'agentic-commerce', 'Discovery capabilities that depend on governed catalogues and ranking controls.', 5),
  ('salesforce-personalization', 'agentic-commerce', 'Personalized experiences depend on consented identity and source data.', 6),
  ('adobe-commerce', 'commerce-platforms', 'Enterprise commerce suite; qualify complexity, licensing and extension model.', 1),
  ('kibo-commerce', 'commerce-platforms', 'Composable commerce; map which functions remain outside the platform.', 2),
  ('kibo-order-management', 'commerce-platforms', 'Order orchestration; validate inventory and fulfilment boundaries.', 3),
  ('salesforce-commerce-cloud', 'commerce-platforms', 'Enterprise commerce in a broader Salesforce operating environment.', 4),
  ('salesforce-order-management', 'commerce-platforms', 'Order and inventory coordination across regions and systems.', 5),
  ('rierino-commerce-platform', 'commerce-platforms', 'Cross-stack commerce orchestration; clarify system and operating ownership.', 6),
  ('adobe-experience-manager-assets', 'product-data-enrichment', 'Digital assets and rights; complementary to, not synonymous with, PIM.', 1),
  ('rierino', 'product-data-enrichment', 'Product information capabilities within a broader commerce platform.', 2),
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
  ('begen', 'https://www.begen.ai'),
  ('admultify', 'https://www.begen.ai'),
  ('benext-ai', 'https://www.benext.com'),
  ('be-cited', 'https://www.benext.com'),
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

insert into public.provider_publication_status (provider_product_id, status, public_disclosure_note, published_at)
select pp.id, 'published', 'Local demo copy of a public Commerce Partners catalogue profile. Confirm current fit, evidence and dependencies before relying on it.', '2026-10-07T00:00:00Z'
from public.provider_products pp
where pp.is_seed_data and pp.seed_batch = 'commonwork-intelligence-v1'
on conflict (provider_product_id) where provider_product_id is not null do update set
  status = excluded.status,
  public_disclosure_note = excluded.public_disclosure_note,
  published_at = excluded.published_at,
  retired_at = null,
  retired_by = null;

commit;