import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const insights = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/insights' }),
  schema: z.object({
    title: z.string(),
    deck: z.string(),
    summary: z.string(),
    seoTitle: z.string().optional(),
    desk: z.enum(['Product Data', 'Standards & Regulation', 'Ecosystem']),
    format: z.enum(['Analysis', 'Brief', 'Vendor Watch']),
    author: z.enum(['dirk-farol', 'dirk-buursma']),
    publishDate: z.coerce.date(),
    featured: z.boolean().optional(),
    tags: z.array(z.string()),
  }),
});

export const collections = { insights };
