// Fetches the latest eurovision.com stories into content/news.json. Run by .github/workflows/news.yml
// once a day; the workflow only commits (and so only triggers a Netlify build) when the file changed.
// Usage: node scripts/fetch-news.ts
import fs from 'node:fs';
import { STORIES_URL, storyLinks, parseStory, type NewsItem } from '../src/lib/news.ts';

const OUT = new URL('../content/news.json', import.meta.url);
const MAX = 8;
const headers = { 'User-Agent': 'EurofizzionNews/1.0 (+https://eurofizzion.com; sing@eurofizzion.com)', Accept: 'text/html' };

const get = async (url: string) => {
  const r = await fetch(url, { headers, redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.text();
};

const links = storyLinks(await get(STORIES_URL)).slice(0, MAX);
const items: NewsItem[] = [];
for (const url of links) {
  try {
    const item = parseStory(await get(url), url);
    if (item) items.push(item);
  } catch (e) {
    console.warn('skip', url, (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 500)); // be gentle with eurovision.com
}

// Keep the old file rather than blanking the news bar when the site can't be read.
if (items.length < 2) {
  console.error(`Only ${items.length} stories found from ${links.length} links; keeping the existing news.json.`);
  process.exit(1);
}
items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
fs.writeFileSync(OUT, JSON.stringify({ source: STORIES_URL, items }, null, 2) + '\n');
console.log(`news.json: ${items.length} stories`, items.map((i) => i.title));
