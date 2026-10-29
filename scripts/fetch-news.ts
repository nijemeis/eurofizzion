// Reads the RSS/Atom feeds listed in content/news-feeds.json (edited in the CMS) and writes their latest
// items to content/news.json. Run by .github/workflows/news.yml once a day; the workflow only commits
// (and so only triggers a Netlify build) when the file changed.
// Usage: node scripts/fetch-news.ts
import fs from 'node:fs';
import { parseFeed, MAX_NEWS, type Feed, type NewsItem } from '../src/lib/news.ts';

const read = (name: string) => JSON.parse(fs.readFileSync(new URL(`../content/${name}`, import.meta.url), 'utf8'));
const OUT = new URL('../content/news.json', import.meta.url);
const feeds: Feed[] = read('news-feeds.json').feeds || [];
const headers = { 'User-Agent': 'EurofizzionNews/1.0 (+https://eurofizzion.com; sing@eurofizzion.com)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' };

if (!feeds.length) {
  console.log('No feeds configured in content/news-feeds.json; nothing to do.');
  process.exit(0);
}

const items: NewsItem[] = [];
let ok = 0;
for (const feed of feeds) {
  try {
    const r = await fetch(feed.url, { headers, redirect: 'follow' });
    if (!r.ok) throw new Error(`returned ${r.status}`);
    const got = parseFeed(await r.text(), feed);
    if (!got.length) throw new Error('no items found (is this an RSS or Atom feed?)');
    items.push(...got);
    ok++;
    console.log(`${feed.name || feed.url}: ${got.length} items`);
  } catch (e) {
    console.warn(`${feed.name || feed.url}: skipped, ${(e as Error).message}`);
  }
}

// Keep the old file rather than blanking the bar when no feed could be read.
if (!ok) {
  console.error('No feed could be read; keeping the existing news.json.');
  process.exit(1);
}
items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
fs.writeFileSync(OUT, JSON.stringify({ items: items.slice(0, MAX_NEWS * 2) }, null, 2) + '\n');
console.log(`news.json: ${Math.min(items.length, MAX_NEWS * 2)} items from ${ok} of ${feeds.length} feeds`);
