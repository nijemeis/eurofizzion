// News from eurovision.com, shown in the next-contest section. Fetched once a day by
// .github/workflows/news.yml (scripts/fetch-news.ts) into content/news.json, never by visitors.
// Parsing relies only on the story links and each story's standard share tags (og:*, JSON-LD),
// not on eurovision.com's page layout, so a redesign there is unlikely to break it.

export type NewsItem = { title: string; url: string; date: string | null; excerpt: string; image: string | null };

export const NEWS_ORIGIN = 'https://www.eurovision.com';
export const STORIES_URL = NEWS_ORIGIN + '/stories/';

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

// Story links on the stories page, in page order (newest first there), without duplicates.
export function storyLinks(html: string, base = STORIES_URL): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#?]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(decode(m[1]), base);
    } catch {
      continue;
    }
    if (u.origin !== NEWS_ORIGIN) continue;
    // /stories/<slug>/ — one segment after /stories/, not pagination or tag listings.
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0] !== 'stories' || /^(page|tag|tags|category)$/i.test(parts[1])) continue;
    const href = `${NEWS_ORIGIN}/stories/${parts[1]}/`;
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

const meta = (html: string, key: string) => {
  // <meta property="og:title" content="…"> with the attributes in either order.
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

const httpsOnly = (u: string, base: string) => {
  try {
    const x = new URL(u, base);
    return x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
};

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…');

// One story page → a news item, or null when it has no usable title.
export function parseStory(html: string, url: string): NewsItem | null {
  const title = meta(html, 'og:title') || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
  if (!title) return null;
  const date = meta(html, 'article:published_time') || jsonLdDate(html);
  const d = date ? new Date(date) : null;
  return {
    title: title.replace(/\s*[|–-]\s*Eurovision Song Contest\s*$/i, ''),
    url,
    date: d && !isNaN(+d) ? d.toISOString() : null,
    excerpt: clip(meta(html, 'og:description') || meta(html, 'description'), 170),
    image: httpsOnly(meta(html, 'og:image'), url),
  };
}

export const newsDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }) : '';
