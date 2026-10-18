// @ts-check
import { defineConfig } from 'astro/config';

import vercel from '@astrojs/vercel';

/**
 * @typedef {{
 *   type: string,
 *   tagName?: string,
 *   properties?: Record<string, unknown>,
 *   children?: MarkdownHtmlNode[]
 * }} MarkdownHtmlNode
 */

/** @returns {(tree: MarkdownHtmlNode) => void} */
function retainedEditorialPolicyLink() {
  return (tree) => {
    /** @param {MarkdownHtmlNode} node */
    function visit(node) {
      if (
        node.type === 'element' &&
        node.tagName === 'a' &&
        node.properties?.href === '../editorial-policy.html'
      ) {
        node.properties.href = 'https://www.commerce-partners.com/editorial-policy.html';
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  // Astro 7 compatibility hook; migrate to processor configuration before Astro 8.
  markdown: {
    rehypePlugins: [retainedEditorialPolicyLink],
  },
  vite: {
    optimizeDeps: {
      include: ['mammoth'],
    },
  },
});
