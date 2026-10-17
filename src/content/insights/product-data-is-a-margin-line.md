---
title: Product data is a margin line now, not an IT ticket
deck: >-
  An AI channel is asking you to publish your own return rate as a ranking input.
  The regulator is demanding the same catalogue discipline with customs
  enforcement attached. Both arrive at the same desk — and it is not IT's.
summary: >-
  Machines now do a growing share of product shortlisting, they read structured
  feeds rather than pages, and Adobe measures roughly a third to a half of retail
  page content as unreadable to them. Meanwhile GPSR and the EU Digital Product
  Passport attach legal accountability to the same attributes. The conclusion for
  buying, sourcing and procurement is uncomfortable but simple.
seoTitle: Product data as a margin issue for retail buying and sourcing
desk: Product Data
format: Analysis
author: dirk-farol
publishDate: 2026-08-27
featured: true
tags:
  - product data
  - agentic commerce
  - digital product passport
  - sourcing
  - procurement
---

Somewhere in the [product feed specification](https://docs.stripe.com/agentic-commerce/product-feed) that Stripe and OpenAI publish for merchants selling through ChatGPT, past the required fields for title, brand and price, there is a recommended field called `return_rate`. It expects a percentage over a rolling window. There is another called `product_warning`, and that one is described as mandatory for items with regulatory warning requirements.

Read those two fields again as a commercial person rather than a technical one. A sales channel is asking you to publish your own return rate, and to declare your regulatory warnings in a structured field, so that a machine can decide whether to put your product in front of a buyer. Return rate is not an IT attribute. It is one of the most commercially sensitive numbers a category holds — and it has just become a ranking input.

That is the shift I want to make the case for here. Product data has stopped being a hygiene task that sits in a backlog behind more interesting work, and has become a determinant of whether a product is findable, sellable and legal to list at all. The people who own the consequences are buyers, sourcing and procurement. In most of the businesses I work with, the people who own the data are not.

## The shortlisting has moved, and the movement is measured

I am wary of agentic commerce projections, and you should be too. Most of the numbers in circulation come from firms selling agentic commerce software. But the traffic data is measured rather than forecast, and it is not ambiguous.

Adobe Analytics, which sees more than a trillion visits to US retail sites, reported AI-referred traffic to those sites [up 138% year on year in May 2026 and up more than 1,300% since October 2024](https://www.digitalcommerce360.com/2026/06/17/adobe-ai-referred-traffic-to-retail-sites-doubles-in-a-year/). Salesforce, working from order data across more than 1.5 billion shoppers, put [AI and agents behind 20% of all retail sales in the 2025 holiday period, worth $262bn](https://www.salesforce.com/news/stories/2025-holiday-shopping-data/), with traffic from third-party AI search channels doubling year on year. The IBM Institute for Business Value, with the NRF, found [45% of consumers now using AI somewhere in their buying journey](https://newsroom.ibm.com/2026-01-07-ibm-nrf-study-brands-and-retailers-navigate-a-new-reality-as-ai-shapes-consumer-decisions-before-shopping-begins) — 41% to research products, 33% to interpret reviews.

Now the honest counterweight, because you will hear the optimistic half of this from every vendor who calls you. Adobe reports AI-referred traffic converting 54% better than non-AI traffic, and Similarweb estimated [ChatGPT-referred visits converting at 11.4% against 5.3% for organic search](https://ir.similarweb.com/news-events/press-releases/detail/132/similarwebs-3rd-annual-global-ecommerce-report-growth-shifts-to-apps-and-ai). But the only peer-reviewed study on the question reaches a different conclusion. Kaiser and Schulze, publishing in [Marketing Science in July 2026](https://ideas.repec.org/a/inm/ormksc/v45y2026i4p699-715.html), took twelve months of first-party data from 973 websites with $20bn of combined revenue and compared more than 50,000 ChatGPT-referred transactions against 164 million from traditional channels. They found LLM referral converting above paid social but below every other traditional channel, and concluded it "currently serves niche informational needs of proficient consumers and does not yet function as a broad conversion channel."

So the volume is still modest and the conversion premium is genuinely contested. What is not contested is the growth rate, and one structural fact underneath it: a machine is increasingly doing the shortlisting. That machine does not browse your site the way a customer does. It reads a feed.

<div class="takeaway">

You can hold a reasonable, sceptical view of how big agentic commerce will get and still have to act now — because the work that makes you visible to agents is the same work that regulation is about to require anyway, and the same work that reduces returns. The investment case does not depend on the forecast being right.

</div>

## What the machines are actually asking for

Look at what the agentic channels demand, and the list is conspicuously commercial rather than technical.

The Stripe and OpenAI feed spec requires GTIN or, failing that, an MPN; it requires `item_group_id` wherever variants exist; it requires a resolvable link and a canonical product category. It recommends popularity score, review count, review rating and that return rate. It [accepts updates every fifteen minutes](https://agentic-commerce-protocol.com/docs/commerce/specs/feed), which is a statement about how stale your price and stock data is allowed to be. Google's long-standing [Merchant Center specification](https://support.google.com/merchants/answer/7052112?hl=en) warns that incorrect variant attributes, wrong categories, poor images and — tellingly — conflicting data between the feed and the website can stop products showing at all.

Every one of those attributes is created or destroyed in commercial processes. GTIN integrity is a supplier onboarding matter. Variant grouping is a range architecture matter. Category taxonomy is a merchandising decision. Review counts are a service outcome. Return rate is a buying outcome. None of them are produced by the IT function; IT merely transports them.

There is also good evidence that the content itself is being judged. Researchers at Walmart Global Tech published [an empirical study](https://arxiv.org/pdf/2409.17460) in which large language models were used to generate the relevance labels that product search ranking models are then trained against — meaning the model's assessment of your product copy becomes the ground truth for how you rank. Thin, inconsistent or contradictory product content is penalised structurally rather than incidentally.

And a great deal of it cannot be read at all. Adobe's AI Content Visibility work scored how much of retailers' page content is machine-readable, and the results by sector run from [cosmetics at 63% down to furniture and home at 47%](https://www.digitalcommerce360.com/2026/06/17/adobe-ai-referred-traffic-to-retail-sites-doubles-in-a-year/). Even the leading category leaves a third of its high-value content invisible to the systems now doing the recommending.

## Regulation arrives at exactly the same place

Here is what makes this more than a channel-optimisation argument. Two pieces of European law are independently forcing the same catalogue discipline, with legal accountability rather than lost sales as the penalty.

The General Product Safety Regulation, [Regulation (EU) 2023/988, has applied since 13 December 2024](https://eur-lex.europa.eu/eli/reg/2023/988/oj/eng). Article 19 requires every distance-selling offer to indicate clearly and visibly the manufacturer's name with a postal *and* electronic address, the EU responsible person where the manufacturer sits outside the EU, information identifying the product including a picture and type, and any warnings in a language consumers understand. Article 22 obliges marketplaces to build interfaces that collect those points and to suspend traders who repeatedly fail. Amazon's own seller guidance is blunt about the consequence: listings in scope [must be compliant and "we deactivate them if we become aware of non-compliance"](https://sellercentral.amazon.ie/gp/help/external/GQAYBJPNAZ2LMDDT). A missing traceability attribute is not untidy. It is a suppressed listing, which is stock cover you cannot sell through.

Then the Digital Product Passport. It is created by [Regulation (EU) 2024/1781](https://eur-lex.europa.eu/eli/reg/2024/1781/oj/eng), the Ecodesign for Sustainable Products Regulation, adopted in June 2024. Article 9 sets the standard in six words that ought to worry anyone who has looked closely at their own catalogue: the data "shall be accurate, complete and up to date." Article 10 requires it to be machine-readable, structured, searchable and transferable, based on open standards, and tied to a persistent unique identifier — and requires the operator to hand a dealer or marketplace the identifier within five working days of a request.

The registry that Article 13 mandated is [now live](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/dpp-registry_en), and the detail worth noting is that customs can use it to verify electronically that an imported product has a valid registered passport before releasing it into free circulation. On the Commission's [current indicative timeline](https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en), batteries come first in February 2027, with construction products, textiles, aluminium and tyres through 2027, furniture in 2028 and mattresses in 2029. Treat those as the Commission's plan rather than fixed law — ESPR delegated acts have slipped before, and each carries a transition period of at least eighteen months. The direction, though, is not in doubt.

The part that matters for accountability is who carries the obligation. It falls on the economic operator placing the product on the market. For own-brand ranges and direct imports, that is the retailer — not the supplier. Which means the standard of "accurate, complete and up to date" lands on the team that wrote the supply agreement.

## The cost was already there before any of this

None of this is new in kind, only in consequence. The best-documented measurement of product data quality between trading partners is still GS1 UK's [Data Crunch report](https://dspace.lib.cranfield.ac.uk/server/api/core/bitstreams/c62030d8-e86f-4aee-8469-83cdaa72aed2/content), produced in 2009 with IBM, the IGD and Cranfield. Comparing 4,290 traded-unit GTINs between four major UK grocers and four major suppliers, it found data inconsistent in over 80% of instances, fewer than half consistent on pack dimensions and weights, and less than a quarter of retailer-held data matching the supplier's own. It put £700m of profit erosion and £300m of lost sales over five years against that.

It is a seventeen-year-old study of UK grocery, and I would not present its cost figures as current. Cite it for what it measures well: the sheer scale of disagreement between two trading partners about the same physical product. In my own experience of platform selection and migration work, that finding has aged remarkably well.

The downstream number is easier. Salesforce measured [$181bn of 2025 holiday online purchases already returned by early January, equal to 14% of purchases and up 10% year on year](https://www.salesforce.com/news/stories/2025-holiday-shopping-data/). The link between product information and returns is supported repeatedly, though I would be careful with the specific percentages: nearly all of them — [Akeneo's 43%](https://retailrewired.co.uk/2026/04/07/poor-product-information-remains-the-root-cause-of-returns-for-43-of-shoppers-akeneo/), [Shotfarm's 40%](https://www.retaildive.com/spons/study-reveals-poor-product-contents-impact-on-digital-sales/419987/) — come from consumer self-report surveys commissioned by companies selling product information management software. The direction is well evidenced. The precision is not.

## What this means for your desk

If you sit in buying, sourcing or procurement, the practical implications are narrower and more actionable than the topic suggests.

**Put data quality in the supply agreement, with teeth.** Required attributes, format, GTIN integrity, update latency, and who pays for correction. If the legal accountability for accuracy lands on you as the operator placing the product on the market, the contract is where you push it back to the party that holds the truth.

**Make it a supplier onboarding gate, not a downstream clean-up.** Data corrected after the fact is expensive and never fully catches up. The cheapest point of intervention is before the first PO.

**Ask, once, who actually owns catalogue completeness.** In most organisations the honest answer is "nobody, and it is on IT's list". That answer is now a commercial exposure, and the fix is an owner with a KPI, not a project.

**Add the regulatory attributes to your critical path.** GPSR data is a live delisting risk today. DPP data is a customs risk from 2027 in the first categories. Both are sourcing conversations with a lead time, and neither improves by waiting.

**Test what a machine can see.** Ask an assistant about a handful of your own products and compare the answer to the truth. It is a crude test and it is remarkably clarifying — particularly if the answer is confidently wrong about your price, your availability or your compliance.

The pattern I keep seeing is a business treating this as a technology programme when every input is commercial and every consequence lands on margin. Bain put the point more sharply than I would in [their agentic commerce work this June](https://www.bain.com/insights/nrf-apac-2026-agentic-commerce-is-exciting-the-agentic-operating-model-is-more-important/): "No amount of agentic sophistication will compensate for inaccurate data."

You do not need a view on how large agentic commerce becomes to act on that. You only need to notice that the machines, the regulators and your own returns line are asking for the same thing.
