---
title: How to test an "agent-ready" claim
deck: >-
  Every commerce vendor is now agent-ready. The protocols are published, which
  means the claim is checkable — here are the questions that separate a shipped
  integration from a roadmap slide.
summary: >-
  The published specifications from Stripe and OpenAI, Google, Visa and Mastercard
  give buyers something rare: an objective test for a vendor claim. Six questions
  to put to any platform, PIM or agency that says it is ready for agentic commerce,
  and what a weak answer to each one tells you.
desk: Ecosystem
format: Vendor Watch
author: dirk-farol
publishDate: 2026-08-13
tags:
  - vendor selection
  - agentic commerce
  - protocols
  - procurement
---

Vendor Watch exists to test claims rather than vendors, and the claim in front of every retail buying committee this year is "agent-ready". It is unusually testable, because the specifications are public. Below are the questions I would put to any platform, PIM vendor, marketplace tool or implementation partner making the claim, and what a poor answer indicates.

*No vendor commissioned, reviewed or paid for this piece. Vendor Watch cannot be sponsored — see the [editorial and advertising policy](../editorial-policy.html).*

**1. Which protocol, by name and version?** There is no single standard. The [Agentic Commerce Protocol](https://agentic-commerce-protocol.com/docs/commerce/specs/feed) from OpenAI and Stripe covers merchant product feeds and checkout. Google's [Agent Payments Protocol](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol), launched in September 2025, addresses agent-initiated payment authorisation and was [donated to the FIDO Alliance](https://blog.google/products-and-platforms/platforms/google-pay/agent-payments-protocol-fido-alliance/) in April 2026. Visa's [Trusted Agent Protocol](https://investor.visa.com/news/news-details/2025/Visa-Introduces-Trusted-Agent-Protocol-An-Ecosystem-Led-Framework-for-AI-Commerce/default.aspx) handles agent identity so merchants can distinguish legitimate agents from bots. Mastercard's [Agent Pay for Machines](https://www.mastercard.com/global/en/news-and-trends/press/2026/june/mastercard-launches-agent-pay-for-machines.html), launched 10 June 2026 with more than thirty partners, targets programmatic agent-to-agent payment. These solve different problems. "Agent-ready" without a named protocol is not an answer.

**2. Can it produce the full required feed today, including the awkward fields?** The [Stripe and OpenAI product feed spec](https://docs.stripe.com/agentic-commerce/product-feed) requires `id`, `title`, `description`, a link that resolves with HTTP 200, `brand`, `image_link`, `availability`, `price`, product category and shipping. It requires `mpn` where there is no GTIN, and `item_group_id` wherever variants exist. Ask specifically about variant grouping and `product_warning`, the compliance field described as mandatory for items with regulatory warning requirements. Those are the two that reveal whether an integration is real.

**3. What is the update latency, end to end?** The spec states the system accepts updates every fifteen minutes, and OpenAI's [guidance](https://developers.openai.com/commerce/guides/get-started) recommends a full feed at least daily plus API updates through the day. The question is not what the channel accepts but what the vendor's own pipeline delivers from a price change in your ERP to a published feed. Answers measured in hours are common and are worth knowing before signature.

**4. Are the recommended commercial signals supported, and where do they come from?** The spec recommends `popularity_score`, `return_rate`, `product_review_count` and `product_review_rating`. Return rate in particular has to be calculated from your own transaction data over a defined window. Ask who computes it, from which system, and whether you control the window. A vendor that has not thought about this has not built it.

**5. Can it show measured machine-readability, not a demo?** Adobe's content visibility scoring found retail sectors ranging from [63% down to 47% machine-readable](https://www.digitalcommerce360.com/2026/06/17/adobe-ai-referred-traffic-to-retail-sites-doubles-in-a-year/) on high-value page content. Ask for a before-and-after on a real catalogue, with the method stated. A screenshot of a chat assistant naming the client's product is a marketing artefact, not evidence.

**6. What happens to agent traffic at your edge?** Visa built the Trusted Agent Protocol precisely because merchant bot-detection was blocking legitimate shopping agents. Feed compliance is wasted if your WAF or bot manager refuses the agent at the door. This question usually belongs to a different vendor than the one answering the other five, which is the point of asking it.

<div class="takeaway">

Two answers should reset the conversation rather than end it. "It is on the roadmap" is legitimate — this is a fast-moving area and honest sequencing is worth more than overclaiming. "We are fully agent-ready" with no protocol named is the one to worry about, because it usually means a feed export that predates all of this and has been relabelled.

</div>

**One caution on the evidence.** Vendor analyses of which product attributes win AI recommendations are proliferating, and some are interesting — Profound's [analysis of holiday shopper prompts](https://www.tryprofound.com/blog/christmas-in-july-how-retailers-win-the-ai-shelf), for instance, reports that product research and comparison prompts made up 68% of the holiday set. But as of August 2026 there is no independent peer-reviewed study establishing which specific attributes cause a model to recommend one SKU over another. The defensible ground is narrower and better: the platforms publish the fields they ingest and rank on. Buy against the published specification, not against the inference.
