export type CompetenceCategory = 'knowledge' | 'practical_capability' | 'way_of_working';

export interface CompetenceOption {
  id: string;
  name: string;
  slug: string;
  category: CompetenceCategory;
  description: string;
}

export interface CompetenceSuggestion {
  competence: CompetenceOption;
  matchedPhrase: string;
  sourceExcerpt: string;
}

const reviewedSynonyms: Record<string, string[]> = {
  'customer-experience': [
    'customer experience',
    'customer service',
    'contact centre',
    'contact center',
    'call centre',
    'call center',
  ],
  'workflow-automation': [
    'workflow automation',
    'business process automation',
    'contact centre automation',
    'contact center automation',
  ],
  'contact-centre-automation-impact-evaluation': [
    'contact-centre automation impact evaluation',
    'contact centre automation impact evaluation',
    'contact center automation impact evaluation',
    'contact-centre automation impact assessment',
    'contact centre automation impact assessment',
    'contact center automation impact assessment',
  ],
  'staffing-capacity-planning': [
    'staffing capacity planning',
    'staff capacity planning',
    'workforce capacity planning',
  ],
  'event-coordination': [
    'event coordination',
    'event planning and coordination',
    'conference coordination',
  ],
  'product-data-quality': ['product data quality'],
  'human-centered-automation': [
    'human-centered automation',
    'human-centred automation',
    'human-in-the-loop automation',
  ],
  'partner-ecosystems': ['partner ecosystem', 'partner ecosystems'],
  'partner-development': ['partner development', 'business development'],
  'commercial-negotiation': ['commercial negotiation', 'commercial negotiations'],
  'program-leadership': ['program leadership', 'programme leadership', 'program lead', 'programme lead'],
  'systems-integration': ['systems integration', 'system integration'],
  'cross-functional-collaboration': ['cross-functional collaboration', 'cross functional collaboration'],
  'evidence-led-decision-making': ['evidence-led decision-making', 'evidence based decision making'],
};

function hasPhrase(text: string, phrase: string, fromIndex = 0): number {
  const loweredText = text.toLocaleLowerCase();
  const loweredPhrase = phrase.toLocaleLowerCase();
  let index = loweredText.indexOf(loweredPhrase, fromIndex);

  while (index !== -1) {
    const before = index > 0 ? text[index - 1] : undefined;
    const afterIndex = index + phrase.length;
    const after = afterIndex < text.length ? text[afterIndex] : undefined;
    const isWord = (character: string | undefined) => character !== undefined && /[\p{L}\p{N}]/u.test(character);

    if (!isWord(before) && !isWord(after)) return index;
    index = loweredText.indexOf(loweredPhrase, index + 1);
  }

  return -1;
}

function isUnestablished(text: string, start: number): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf('.', start - 1),
    text.lastIndexOf('!', start - 1),
    text.lastIndexOf('?', start - 1),
    text.lastIndexOf(';', start - 1),
    text.lastIndexOf('\n', start - 1),
  ) + 1;
  const precedingText = text.slice(Math.max(sentenceStart, start - 100), start).toLocaleLowerCase();
  return /(?:\b(?:no|zero)\s+(?:prior\s+)?experience\s+(?:in|with)|\b(?:not|never)\s+(?:experienced|skilled|proficient|qualified|competent)\s+(?:in|with)|\b(?:unfamiliar|unskilled)\s+with|\binterested\s+in|\bwant(?:ing)?\s+to\s+learn(?:\s+more)?\s+about|\bhope(?:ing)?\s+to\s+learn|\baspir(?:e|ing)\s+to\s+(?:learn|develop)|\bseek(?:ing)?\s+to\s+learn|\bwould\s+like\s+to\s+learn)\s*$/.test(precedingText);
}

function getExcerpt(text: string, start: number, length: number): string {
  const radius = 72;
  const excerptStart = Math.max(0, start - radius);
  const excerptEnd = Math.min(text.length, start + length + radius);
  const prefix = excerptStart > 0 ? '…' : '';
  const suffix = excerptEnd < text.length ? '…' : '';
  return `${prefix}${text.slice(excerptStart, excerptEnd).trim()}${suffix}`;
}

export function findCompetenceSuggestions(
  text: string,
  competencies: CompetenceOption[],
  existingSlugs: Set<string> = new Set(),
): { suggestions: CompetenceSuggestion[]; duplicateCount: number } {
  const suggestions: Array<CompetenceSuggestion & { sourceIndex: number }> = [];
  let duplicateCount = 0;

  for (const competence of competencies) {
    const phrases = [...new Set([competence.name, ...(reviewedSynonyms[competence.slug] ?? [])])];
    const match = phrases
      .flatMap((phrase) => {
        const matches: Array<{ phrase: string; index: number }> = [];
        let index = hasPhrase(text, phrase);
        while (index >= 0) {
          if (!isUnestablished(text, index)) matches.push({ phrase, index });
          index = hasPhrase(text, phrase, index + phrase.length);
        }
        return matches;
      })
      .sort((left, right) => left.index - right.index || right.phrase.length - left.phrase.length)[0];

    if (!match) continue;
    if (existingSlugs.has(competence.slug)) {
      duplicateCount += 1;
      continue;
    }

    suggestions.push({
      competence,
      matchedPhrase: match.phrase,
      sourceExcerpt: getExcerpt(text, match.index, match.phrase.length),
      sourceIndex: match.index,
    });
  }

  suggestions.sort((left, right) => left.sourceIndex - right.sourceIndex);
  return {
    suggestions: suggestions.map(({ sourceIndex: _sourceIndex, ...suggestion }) => suggestion),
    duplicateCount,
  };
}
