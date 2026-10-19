import { expect, test } from '@playwright/test';
import { slides, fields, sources } from '../src/lib/playbook/lisbon-revision';
test('revision has title and eight stable section identities', () => { expect(slides).toHaveLength(9); expect(new Set(slides.map(s => s.id)).size).toBe(9); expect(slides[8].id).toBe('next-retailer-test'); });
test('opening establishes services without a launch panel', () => { const text = JSON.stringify(slides[0]); for (const service of ['Vendor Select','GTM & Ecosystem','Venture Scout']) expect(text).toContain(service); expect(text).not.toContain('Introducing Commonwork'); });
test('four tools retain distinct jobs and pending suppliers', () => { expect(slides[7].panels.map(p => p.clip)).toEqual(['geoffy','begen','rierino','becited']); expect(new Set(slides[7].panels.map(p => p.role)).size).toBe(4); });
test('exercise records evidence and permits no correction', () => { expect(slides[8].panels).toHaveLength(4); expect(fields.join(' ')).toContain('no correction identified'); for (const [, url] of sources) expect(new URL(url).protocol).toBe('https:'); });
