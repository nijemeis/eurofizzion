import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage, parseFeed, mergeNews, newsDate, type NewsItem } from '../src/lib/news.ts';

test('parsePage reads share tags in either attribute order and drops the site suffix', () => {
  const html = `<html><head>
    <title>Fallback</title>
    <meta property="og:site_name" content="Eurovision Song Contest">
    <meta content="Burgas 2027: dates confirmed &amp; tickets soon | Eurovision Song Contest" property="og:title">
    <meta property="og:description" content="The EBU and BNT have confirmed the dates for the 71st Eurovision Song Contest in Burgas, with semi-finals on 11 and 13 May and the Grand Final on Saturday 15 May 2027 at Arena Burgas.">
    <meta property="og:image" content="/media/burgas.jpg">
    <meta property="article:published_time" content="2026-10-28T09:30:00+01:00">
  </head></html>`;
  const n = parsePage(html, 'https://www.eurovision.com/stories/burgas-2027/')!;
  assert.equal(n.title, 'Burgas 2027: dates confirmed & tickets soon');
  assert.equal(n.image, 'https://www.eurovision.com/media/burgas.jpg');
  assert.equal(n.date, '2026-10-28T08:30:00.000Z');
  assert.equal(n.source, 'Eurovision Song Contest');
  assert.ok(n.excerpt.length <= 171 && n.excerpt.endsWith('…'));
  assert.equal(newsDate(n.date), '28 Oct 2026');
});

test('parsePage falls back to <title>, JSON-LD and the host name; refuses javascript: images', () => {
  const html = `<title>Canada makes its debut</title><meta name="description" content="Short and sweet.">
    <meta property="og:image" content="javascript:alert(1)">
    <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-20T12:00:00Z"}</script>`;
  const n = parsePage(html, 'https://www.example.com/news/canada/')!;
  assert.deepEqual([n.title, n.excerpt, n.image, n.date, n.source], ['Canada makes its debut', 'Short and sweet.', null, '2026-10-20T12:00:00.000Z', 'example.com']);
  assert.equal(parsePage('<p>no title</p>', 'https://example.com/x'), null);
});

test('parseFeed reads RSS 2.0 with CDATA, media images and HTML descriptions', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <title>Fan news</title>
    <item>
      <title><![CDATA[Canada confirms its first ever entry & broadcaster]]></title>
      <link>https://fan.example/2026/10/canada/</link>
      <pubDate>Mon, 26 Oct 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[<p>The CBC will <b>debut</b> in Burgas.</p>]]></description>
      <media:content url="https://fan.example/img/canada.jpg" medium="image" />
    </item>
    <item>
      <title>Second story</title>
      <link>https://fan.example/2026/10/second/</link>
      <pubDate>Sun, 25 Oct 2026 10:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<img src="https://fan.example/img/second.png"> Body text]]></content:encoded>
    </item>
    <item><title>No link, skipped</title></item>
  </channel></rss>`;
  const items = parseFeed(xml, { name: 'Fan News', url: 'https://fan.example/feed/' });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: 'Canada confirms its first ever entry & broadcaster',
    url: 'https://fan.example/2026/10/canada/',
    date: '2026-10-26T10:00:00.000Z',
    excerpt: 'The CBC will debut in Burgas.',
    image: 'https://fan.example/img/canada.jpg',
    source: 'Fan News',
  });
  assert.equal(items[1].image, 'https://fan.example/img/second.png');
});

test('parseFeed reads Atom entries', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title type="html">Rehearsals schedule out</title>
    <link rel="alternate" href="https://atom.example/rehearsals"/>
    <published>2026-10-27T08:00:00Z</published>
    <summary>Who rehearses when.</summary>
  </entry></feed>`;
  const [e] = parseFeed(xml, { name: '', url: 'https://atom.example/feed.atom' });
  assert.deepEqual([e.title, e.url, e.date, e.excerpt, e.image, e.source], ['Rehearsals schedule out', 'https://atom.example/rehearsals', '2026-10-27T08:00:00.000Z', 'Who rehearses when.', null, 'atom.example']);
});

test('mergeNews puts picks first, sorts by date, removes duplicates and caps the count', () => {
  const n = (title: string, url: string, date: string): NewsItem => ({ title, url, date, excerpt: '', image: null, source: 's' });
  const picks = [n('old pick', 'https://a/1', '2026-01-01T00:00:00Z'), n('new pick', 'https://a/2', '2026-02-01T00:00:00Z')];
  const feed = [n('dup of pick', 'https://a/2/', '2026-03-01T00:00:00Z'), ...Array.from({ length: 10 }, (_, i) => n('f' + i, 'https://b/' + i, `2026-10-${String(10 + i)}T00:00:00Z`))];
  const out = mergeNews(picks, feed, 5);
  assert.deepEqual(out.map((x) => x.title), ['new pick', 'old pick', 'f9', 'f8', 'f7']);
});
