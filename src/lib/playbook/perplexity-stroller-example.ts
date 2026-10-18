export interface SuppliedSource {
  id: string;
  label: string;
  url: string;
}

export interface SuppliedProduct {
  name: string;
  destination: string;
  sourceIds: string[];
}

export const perplexityStrollerExample = {
  provider: 'Perplexity',
  productStyling: 'Perplexity shopping research',
  title: 'Recorded shopping-research example',
  sharedThreadUrl: 'https://www.perplexity.ai/search/bfa51eaa-cd9a-49c1-89f5-3b0451639d88',
  promptLabel: 'Demonstration prompt prepared for this example',
  prompt: 'I’m shopping in Portugal for a stroller for my toddler. I need something lightweight, compact and easy to fold, with a good recline and canopy, suitable for city sidewalks and occasional uneven paths. My budget is €400–€700. Find three suitable models, explain the trade-offs, and recommend the best fit. Where possible, link to retailers serving Portugal and distinguish verified facts from information I should check.',
  requestSummary: 'Portugal · lightweight, compact toddler stroller · €400–€700 demonstration budget',
  recommendation: 'My best fit is the Joolz Aer²…',
  resultLimitation: 'A supplied response from one session—not a product test, visibility benchmark or purchase. Prices, stock and reported discrepancies below are statements in that response, not independently reverified or current-price claims.',
  stageFooter: 'Perplexity shopping-research example · Portugal request · One session; not a product test or visibility benchmark · No purchase demonstrated',
  editorialSummaryLabel: 'Editorial summary of the supplied assistant response',
  presenterNote: 'I asked for a stroller suited to a specific need and budget in Portugal. The assistant selected three products, recommended one and linked to sellers. Before entering a shop, it had already shaped the consideration set.\n\nFor a retailer, there are three questions: is my product considered, is the information accurate, and is my shop offered as the seller?\n\nThis is shopping research, not an autonomous purchase. It shows the challenge we need to respond to with expertise, reliable information and connected systems.',
  presenterAccuracyGate: 'Do not state that this exact prompt and response are from the same confirmed session until Dirk confirms.',
  products: [
    { name: 'Joolz Aer²', destination: 'Joolz Portugal', sourceIds: ['S1'] },
    { name: 'Bugaboo Butterfly 2', destination: 'Bugaboo Portugal storefront · El Corte Inglés Portugal', sourceIds: ['S3', 'S4'] },
    { name: 'Nuna TRVL lx', destination: 'Gotu Portugal', sourceIds: ['S5'] },
  ] satisfies SuppliedProduct[],
  visibilityQuestions: [
    'Is the product considered?',
    'Are its facts accurate?',
    'Is our shop offered as the seller?',
  ],
  response: `My best fit is the Joolz Aer²: it combines the lowest published weight here, a very compact one-handed fold, a deep recline and an extendable sun canopy. Choose the Nuna TRVL lx instead if uneven paths matter more than folded size; choose the Bugaboo Butterfly 2 if you prefer its seating and storage layout after trying it in person. Those recommendations are my assessment of the published specifications, not a hands-on road test.
Sources: [S1], [S2], [S3].

All three have Portugal-facing purchase options within your €400–€700 budget. Prices below are those displayed on the pages checked, not guaranteed checkout prices.

THREE SUITABLE MODELS

Joolz Aer²
- €469 in Space Black at Joolz Portugal. [S1]
- 6.5 kg with seat; 53 × 44 × 23.5 cm folded. [S1]
- Main trade-off: Best portability on paper; its small wheels make a loaded test on uneven paving important.

Bugaboo Butterfly 2
- €499, shown in stock in Heritage Black at Bugaboo’s Portugal storefront. Also listed by El Corte Inglés Portugal. [S3], [S4]
- 7.3 kg fully assembled; 55.5 × 44.8 × 24.5 cm folded, with dimensions reordered for comparison. [S3]
- Main trade-off: Compact, with good seating and storage features, but heavier than the Joolz without substantially larger wheels.

Nuna TRVL lx
- €424.15 promotional price, reduced from €499, at Gotu Portugal. Promotion is stock-limited. [S5]
- 7.1 kg excluding armbar, insert and rain cover; 71 × 52 × 34 cm folded, dimensions reordered. [S2]
- Main trade-off: Strongest uneven-path candidate on paper, but noticeably bulkier folded; its quoted weight is not directly comparable with Bugaboo’s fully assembled figure.

The ride-quality comparisons below are inferences from wheel sizes, suspension and design—not verified comparative performance.

1. JOOLZ AER² — BEST OVERALL BALANCE

Verified on the product pages:
- One-handed, advertised one-second fold, with an integrated shoulder carry strap.
- Three one-handed recline positions; El Corte Inglés specifies a maximum recline of 178°.
- Super-extendable UPF 50+ canopy with ventilation, plus an adjustable leg support.
- Suspension, 14.5 cm front wheels and 15.5 cm rear wheels.
- A 22 kg child limit and an 8 kg basket capacity. [S1], [S6]

Why it fits: carrying, folding and storing are central to your brief, and this is the lightest and smallest-folding option of the three. It also avoids making nap comfort an obvious sacrifice for portability. [S1], [S6]

Trade-off: its wheels are similar in size to the Bugaboo’s and considerably smaller than the Nuna’s. I would treat it primarily as a city stroller that can handle occasional uneven sections—not assume it will feel comfortable over prolonged rough paving. Check that with your toddler seated before buying. [S1], [S3], [S2]

2. BUGABOO BUTTERFLY 2 — COMPACT ALTERNATIVE WITH USEFUL EVERYDAY STORAGE

Verified by Bugaboo:
- Advertised one-second compact fold.
- Lay-flat recline and a fully upright seating position.
- Adjustable footrest and an extendable UPF 50+ canopy with a peek-a-boo panel.
- Full suspension, with 14.1 cm front and 15.1 cm rear wheels.
- A 22 kg seat limit, 8 kg basket and an additional seat-back storage pocket. [S3]

Why consider it: it combines a compact fold with an upright-to-flat seat range and practical storage. It is a credible alternative if your toddler fits its seat better or you prefer its fold and harness in person. [S3]

Trade-off: it weighs 0.8 kg more than the Joolz, while its wheels are slightly smaller. I would not pay the weight penalty expecting a clear rough-surface advantage—the specifications do not establish one. [S3], [S1]

Check the generation carefully: this recommendation is for the Butterfly 2. Bugaboo explicitly distinguishes its lay-flat and fully upright seat from the original Butterfly, which lacks those positions. [S3]

3. NUNA TRVL LX — BEST IF UNEVEN PATHS CARRY MORE WEIGHT

Verified on Nuna’s international product page:
- One-handed fold that stands on its own.
- Lie-flat position, adjustable recline and two-position calf support.
- Extendable, water-repellent UPF 50+ canopy with mesh ventilation.
- All-wheel suspension and lockable front swivel wheels.
- 16.5 cm front wheels and 21.6 cm rear wheels—larger than either rival here.
- A 22 kg child limit; carry bag and rain cover listed as included. Gotu also lists those accessories. [S2], [S5]

Why consider it: the larger wheels and front-wheel locks make it my strongest candidate for a mix of sidewalks and occasional uneven paths. That is a specification-based judgement, not proof that it rides better on every surface. [S2]

Trade-off: its folded package is substantially taller, wider and thicker than the other two. Also, the advertised 7.1 kg excludes several components, so it should not be read as lighter than the fully assembled 7.3 kg Bugaboo. [S2], [S3]

RECOMMENDATION AND CHECKS BEFORE BUYING

I would start with the Joolz Aer² and only switch to the Nuna TRVL lx if a loaded paving test shows that ride comfort matters more than the smaller fold. The Joolz most closely matches the overall brief; the Nuna makes the clearer compromise toward larger wheels. [S1], [S2]

Before committing:

- Try your toddler in the seat. Check head clearance under the canopy, harness fit, leg support and comfort both upright and reclined. All three publish a 22 kg limit, but that does not establish an equally good fit for every toddler. [S1], [S3], [S2]

- Fold, unfold and lift the actual stroller. Confirm it fits your boot or storage space and that the ready-to-use weight feels manageable.

- Test the surface that matters. A short, loaded trial on uneven paving is more informative than a manufacturer’s broad “any terrain” claim; I have not independently verified those claims.

- Confirm the final delivered price, colour stock, accessories and returns. Joolz’s page displays both free-delivery messaging and a €4.92 shipping line, so confirm the actual charge. Bugaboo says regional delivery rules appear at checkout. Gotu’s Nuna discount is explicitly stock-limited. [S1], [S3], [S5]

- Resolve the Nuna weight-limit discrepancy. Gotu’s title says 22.7 kg, but its detailed specifications and Nuna’s international page say 22 kg. Use 22 kg as the conservative limit unless the manual supplied with the exact Portuguese model confirms otherwise. [S5], [S2]`,
  sources: [
    { id: 'S1', label: 'Joolz Portugal — Joolz Aer² Space Black', url: 'https://joolz.pt/produto/joolz-aer2-space-black/' },
    { id: 'S2', label: 'Nuna — TRVL lx', url: 'https://nunababy.com/en/trvl-lx' },
    { id: 'S3', label: 'Bugaboo — Butterfly 2, Portugal-facing storefront', url: 'https://www.bugaboo.com/pt-en/strollers/bugaboo-butterfly-2/bugaboo-butterfly-2-travel-stroller-PM007650.html' },
    { id: 'S4', label: 'El Corte Inglés Portugal — Butterfly 2', url: 'https://www.elcorteingles.pt/puericultura/A55550995-carrinho-de-passeio-butterfly-2/' },
    { id: 'S5', label: 'Gotu Portugal — Nuna TRVL lx', url: 'https://gotu.pt/products/nuna-carrinho-de-passeio-compacto-trvl-lx-ate-22-7-kg' },
    { id: 'S6', label: 'El Corte Inglés Portugal — Joolz Aer²', url: 'https://www.elcorteingles.pt/puericultura/A55599066-carrinho-de-passeio-aer2/' },
  ] satisfies SuppliedSource[],
  publicLimitation: 'One supplied session output—not a product test, visibility benchmark or purchase. The response’s product facts, prices, stock and reported discrepancies have not been independently reverified; do not treat prices or availability as current.',
  internalEvidence: {
    source: 'Response supplied by Dirk from a shared Perplexity thread.',
    exactPromptCorrespondence: 'Not independently confirmed.',
    captureDateTime: null as string | null,
    accountPlan: null as string | null,
    sessionSettings: null as string | null,
    productFacts: 'Statements in the supplied response; not independently reverified.',
    pricesAndStock: 'Statements in the supplied response; not current-price/availability claims.',
    purchase: 'No purchase demonstrated.',
  },
};
