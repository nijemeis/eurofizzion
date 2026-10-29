// News bar in the next-contest section. Two sources, merged at build time:
// - content/news-picks.json: stories the editor adds in the CMS (always shown first)
// - content/news.json: the latest items from the RSS/Atom feeds in content/news-feeds.json,
//   refreshed once a day by .github/workflows/news.yml (scripts/fetch-news.ts)
// Visitors never fetch anything; this file has no network code.

export type NewsItem = { title: string; url: string; date: string | null; excerpt: string; image: string | null; source: string };
export type Feed = { name: string; url: string };

export const MAX_NEWS = 8;

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const stripTags = (s: string) => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…');
const isoOrNull = (s: string) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(+d) ? d.toISOString() : null;
};
// Only http(s) links and images ever reach the page.
export const safeUrl = (u: string, base?: string) => {
  if (!u || !u.trim()) return null; // an empty link would otherwise resolve to the base itself
  try {
    const x = new URL(decode(u.trim()), base);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
};

// "www.eurovoix.com" → "eurovoix.com"
export const sourceName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/* ---------- One web page (CMS link preview) ---------- */

const meta = (html: string, key: string) => {
  const k = key.replace(/[.:]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'));
  const b = html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${k}["']`, 'i'));
  const v = (a || b)?.[1];
  return v ? decode(v).trim() : '';
};

function jsonLdDate(html: string): string {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const found = m[1].match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (found) return found[1];
  }
  return '';
}

// A story page → a news item from its share tags (og:*, article:published_time, JSON-LD), or null without a title.
export function parsePage(html: string, url: string): NewsItem | null {
  const site = meta(html, 'og:site_name');
  let title = meta(html, 'og:title') || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
  if (!title) return null;
  // Drop a trailing " | Site name" when the site name is known.
  if (site) title = title.replace(new RegExp(`\\s*[|–-]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  return {
    title,
    url,
    date: isoOrNull(meta(html, 'article:published_time') || jsonLdDate(html)),
    excerpt: clip(meta(html, 'og:description') || meta(html, 'description'), 170),
    image: safeUrl(meta(html, 'og:image'), url),
    source: site || sourceName(url),
  };
}

/* ---------- RSS 2.0 and Atom feeds (daily GitHub Action) ---------- */

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (xml: string, tagName: string, a: string, where?: RegExp) => {
  for (const m of xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))) {
    if (where && !where.test(m[0])) continue;
    const v = m[0].match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (v) return v[1];
  }
  return '';
};

export function parseFeed(xml: string, feed: Feed, limit = 6): NewsItem[] {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const out: NewsItem[] = [];
  for (const b of blocks) {
    const title = stripTags(tag(b, 'title'));
    // RSS: <link>url</link>; Atom: <link rel="alternate" href="url"/>
    const link = safeUrl(stripTags(tag(b, 'link')) || attr(b, 'link', 'href', /rel\s*=\s*["']alternate["']/i) || attr(b, 'link', 'href'), feed.url);
    if (!title || !link) continue;
    const body = tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content');
    const image =
      attr(b, 'media:content', 'url', /medium\s*=\s*["']image["']|type\s*=\s*["']image\//i) ||
      attr(b, 'media:thumbnail', 'url') ||
      attr(b, 'enclosure', 'url', /type\s*=\s*["']image\//i) ||
      attr(b, 'media:content', 'url') ||
      (decode(body.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1] ?? '');
    out.push({
      title,
      url: link,
      date: isoOrNull(stripTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'))),
      excerpt: clip(stripTags(tag(b, 'description') || tag(b, 'summary') || body), 170),
      image: image ? safeUrl(image, link) : null,
      source: feed.name || sourceName(link),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- The bar ---------- */

// Editor picks first (newest first), then feed items by date; no duplicate links.
export function mergeNews(picks: NewsItem[], fromFeeds: NewsItem[], max = MAX_NEWS): NewsItem[] {
  const byDate = (a: NewsItem, b: NewsItem) => (b.date || '').localeCompare(a.date || '');
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of [...picks.slice().sort(byDate), ...fromFeeds.slice().sort(byDate)]) {
    const key = n.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

export const newsDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }) : '';
