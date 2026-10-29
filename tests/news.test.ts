import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyLinks, parseStory, newsDate } from '../src/lib/news.ts';

test('storyLinks finds story pages only, in order, without duplicates', () => {
  const html = `
    <a href="/stories/burgas-2027-dates-confirmed/"><img src="x.jpg"></a>
    <a href="/stories/burgas-2027-dates-confirmed/">Burgas 2027 dates confirmed</a>
    <a href="https://www.eurovision.com/stories/canada-debut">Canada</a>
    <a href='/stories/page/2/'>Next</a>
    <a href="/stories/">All</a>
    <a href="/stories/tag/burgas/">Tag</a>
    <a href="https://evil.example/stories/fake/">Elsewhere</a>
    <a href="/stories/second-story/?utm=x#top">Second</a>
    <a href="/participants/bulgaria/">Bulgaria</a>`;
  assert.deepEqual(storyLinks(html), [
    'https://www.eurovision.com/stories/burgas-2027-dates-confirmed/',
    'https://www.eurovision.com/stories/canada-debut/',
  ]);
});

test('parseStory reads share tags in either attribute order and cleans them up', () => {
  const html = `<html><head>
    <title>Fallback title | Eurovision Song Contest</title>
    <meta content="Burgas 2027: dates confirmed &amp; tickets soon | Eurovision Song Contest" property="og:title">
    <meta property="og:description" content="The EBU and BNT have confirmed the dates for the 71st Eurovision Song Contest in Burgas, with semi-finals on 11 and 13 May and the Grand Final on Saturday 15 May 2027 at Arena Burgas.">
    <meta property="og:image" content="/media/burgas.jpg">
    <meta property="article:published_time" content="2026-10-28T09:30:00+01:00">
  </head></html>`;
  const n = parseStory(html, 'https://www.eurovision.com/stories/burgas-2027-dates-confirmed/')!;
  assert.equal(n.title, 'Burgas 2027: dates confirmed & tickets soon');
  assert.equal(n.image, 'https://www.eurovision.com/media/burgas.jpg');
  assert.equal(n.date, '2026-10-28T08:30:00.000Z');
  assert.ok(n.excerpt.length <= 171 && n.excerpt.endsWith('…'));
  assert.equal(newsDate(n.date), '28 Oct 2026');
});

test('parseStory falls back to JSON-LD and <title>, and refuses non-https images', () => {
  const html = `<title>Canada makes its debut</title>
    <meta name="description" content="Short and sweet.">
    <meta property="og:image" content="javascript:alert(1)">
    <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-20T12:00:00Z"}</script>`;
  const n = parseStory(html, 'https://www.eurovision.com/stories/canada-debut/')!;
  assert.deepEqual([n.title, n.excerpt, n.image, n.date], ['Canada makes its debut', 'Short and sweet.', null, '2026-10-20T12:00:00.000Z']);
  assert.equal(parseStory('<p>no title</p>', 'https://www.eurovision.com/stories/x/'), null);
});
