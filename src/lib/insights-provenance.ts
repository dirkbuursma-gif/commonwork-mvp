export const sourceRevision = 'b2ee4b427d9b1b455add456a9abea01b615070fc';

export const articleProvenance = {
  'product-data-is-a-margin-line': {
    sourceFile: 'src/content/articles/product-data-is-a-margin-line.md',
    sourceBlob: '895713e2b51cd371afaf0d588e11965f961894d8',
    sourceAuthorId: 'dirk-farol',
    sourceUrl: 'https://www.commerce-partners.com/review/product-data-is-a-margin-line.html',
  },
  'dpp-registry-is-live': {
    sourceFile: 'src/content/articles/dpp-registry-is-live.md',
    sourceBlob: '2036a65a961de9a0b901f4e53292e1bf7356332e',
    sourceAuthorId: 'dirk-farol',
    sourceUrl: 'https://www.commerce-partners.com/review/dpp-registry-is-live.html',
  },
  'testing-the-agent-ready-claim': {
    sourceFile: 'src/content/articles/testing-the-agent-ready-claim.md',
    sourceBlob: 'f7b483b57d689d107e78651e5747634514ececbb',
    sourceAuthorId: 'dirk-farol',
    sourceUrl: 'https://www.commerce-partners.com/review/testing-the-agent-ready-claim.html',
  },
} as const;

const publicBylineBySourceAuthorId: Record<string, string> = {
  'dirk-farol': 'Dirk Buursma, Commerce Partners',
  'dirk-buursma': 'Dirk Buursma, Commerce Partners',
};

export function getInsightsByline(sourceAuthorId: string): string {
  const byline = publicBylineBySourceAuthorId[sourceAuthorId];
  if (!byline) throw new Error(`No approved public byline mapping for source author "${sourceAuthorId}".`);
  return byline;
}

export const insightTopics = [
  { slug: 'product-data', label: 'Product Data', desk: 'Product Data' },
  { slug: 'standards-regulation', label: 'Standards & Regulation', desk: 'Standards & Regulation' },
  { slug: 'ecosystem', label: 'Ecosystem', desk: 'Ecosystem' },
] as const;

export function getInsightTopic(slug: string | null) {
  return insightTopics.find((topic) => topic.slug === slug);
}

export const insightArticleSlugs = Object.keys(articleProvenance);
