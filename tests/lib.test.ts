import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseHTML } from 'linkedom';
import { parseWiki } from '../src/lib/wiki.ts';
import { scoreItems, bestFor, parseYouTubeId } from '../src/lib/youtube.ts';
import { contestView, countryView, ord, slugify } from '../src/lib/derive.ts';
import { mergeImport, setVideo, summarise } from '../src/lib/cms.ts';
import type { Contest } from '../src/lib/types.ts';

const countries = JSON.parse(fs.readFileSync(new URL('../content/countries.json', import.meta.url), 'utf8'));
// Live content changes whenever the CMS publishes, so tests use the 2026 results with known videos only.
const c2026: Contest = JSON.parse(fs.readFileSync(new URL('../content/contests/2026.json', import.meta.url), 'utf8'));
c2026.entries = c2026.entries.map(({ video: _v, ...e }) => (e.country === 'ro' ? { ...e, video: { live: 'yn0YmI0dPb8' } } : e));
const fixture = fs.readFileSync(new URL('./fixtures/wiki-sample.html', import.meta.url), 'utf8');

test('ord', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ord), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
});

test('parseWiki reads finals, semis and the jury/televote split', () => {
  const { document } = parseHTML(fixture);
  const { entries, msg } = parseWiki(document, countries);
  assert.match(msg, /Found 4 finalists and 2 semi-final non-qualifiers, with the jury\/televote split/);
  const by = Object.fromEntries(entries.map((e) => [e.country, e]));
  assert.deepEqual(
    { place: by.ch.place, jury: by.ch.jury, televote: by.ch.televote, total: by.ch.total, ro: by.ch.runningOrder, status: by.ch.status },
    { place: 1, jury: 365, televote: 226, total: 591, ro: 21, status: '' },
  );
  assert.equal(by.ch.song, 'The Code'); // quotes and footnotes stripped
  assert.equal(by.fr.status, 'A'); // in the final, in no semi
  assert.equal(by.cz.country, 'cz'); // "Czech Republic" alias
  assert.deepEqual({ s: by.pl.status, p: by.pl.semiPlace, pts: by.pl.semiPoints, place: by.pl.place }, { s: 'SF1', p: 12, pts: 35, place: null });
  assert.equal(by.mt.status, 'SF2');
  assert.equal(entries.find((e) => e.country === 'nl'), undefined); // national selection table skipped
});

test('parseWiki reads a real Wikipedia article (2019, Parsoid HTML)', () => {
  // Saved from the REST API in October 2026 (CC BY-SA, Wikipedia contributors).
  const html = zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/wikipedia-esc-2019.html.gz', import.meta.url))).toString('utf8');
  const { document } = parseHTML(html);
  const { entries, msg } = parseWiki(document, countries);
  assert.match(msg, /Found 26 finalists and 15 semi-final non-qualifiers, with the jury\/televote split/);
  const by = Object.fromEntries(entries.map((e) => [e.country, e]));
  assert.deepEqual([by.nl.place, by.nl.jury, by.nl.televote, by.nl.total, by.nl.runningOrder], [1, 237, 261, 498, 12]);
  assert.deepEqual([by.no.place, by.no.jury, by.no.televote], [6, 40, 291]);
  assert.deepEqual([by.it.status, by.it.place, by.it.total], ['A', 2, 472]);
  assert.equal(by.il.status, 'A'); // host
  assert.equal(by.is.song, 'Hatrið mun sigra');
  assert.deepEqual([by.lt.status, by.lt.semiPlace, by.lt.semiPoints], ['SF2', 11, 93]);
  assert.ok(entries.filter((e) => e.place).every((e) => e.jury! + e.televote! === e.total));
});

test('parseWiki reports a page without results', () => {
  const { document } = parseHTML('<html><body><h2>History</h2><p>Nothing</p></body></html>');
  assert.equal(parseWiki(document, countries).entries.length, 0);
});

test('YouTube scoring classifies and auto-picks', () => {
  const c = scoreItems(
    [
      { id: 'aaaaaaaaaaa', title: 'Nemo - The Code | Switzerland 🇨🇭 | Grand Final | Eurovision 2024', channel: 'Eurovision Song Contest', thumb: '' },
      { id: 'bbbbbbbbbbb', title: 'Nemo - The Code (Official Music Video)', channel: 'Nemo', thumb: '' },
      { id: 'ccccccccccc', title: 'Nemo - The Code | First Rehearsal', channel: 'Eurovision Song Contest', thumb: '' },
      { id: 'ddddddddddd', title: 'Something else entirely', channel: 'x', thumb: '' },
    ],
    'Nemo',
    'The Code',
    2024,
  );
  assert.deepEqual(c.map((x) => x.kind), ['live', 'mv', 'other', 'other']);
  assert.equal(c[0].match, 1);
  assert.equal(bestFor(c, 'live')?.id, 'aaaaaaaaaaa');
  assert.equal(bestFor(c, 'mv')?.id, 'bbbbbbbbbbb');
  assert.equal(scoreItems([{ id: 'x', title: 'ABBA Waterloo', channel: '', thumb: '' }], 'ABBA', 'Waterloo', 1974)[0].kind, 'live');
});

test('parseYouTubeId', () => {
  assert.equal(parseYouTubeId('https://www.youtube.com/watch?v=yn0YmI0dPb8&t=3'), 'yn0YmI0dPb8');
  assert.equal(parseYouTubeId('https://youtu.be/yn0YmI0dPb8'), 'yn0YmI0dPb8');
  assert.equal(parseYouTubeId('yn0YmI0dPb8'), 'yn0YmI0dPb8');
  assert.equal(parseYouTubeId('not a link'), null);
});

test('contestView derives the 2026 numbers from the design', () => {
  const v = contestView(c2026, countries);
  assert.equal(v.sub, '35 songs · 25 in the Grand Final · 16 May 2026 · Wiener Stadthalle');
  assert.deepEqual(v.spot.stats.map((s) => s.v), [516, 204, 312, '+173']);
  assert.equal(v.oddsInsight, 'Finland went in as the bookies’ favourite at 1/1 and finished 6th. Bulgaria won from 7th in the betting (35/1).');
  assert.deepEqual(v.highlights.map((h) => h.c), ['bg', 'bg', 'ro']);
  // Reveal goes from the lowest jury score upwards; the 7th reveal is Serbia with 52 (as in the handoff screenshot).
  const rs = c2026.entries.find((e) => e.country === v.revealOrder[6])!;
  assert.deepEqual([rs.country, rs.televote], ['rs', 52]);
  assert.deepEqual(v.counts, { all: 35, final: 25, semi: 10 });
});

test('mergeImport keeps videos and odds; summarise describes changes', () => {
  const imported = c2026.entries.map(({ video: _v, odds: _o, ...e }) => ({ ...e, oddsRank: null }));
  const merged = mergeImport(2026, imported, c2026, undefined, countries);
  assert.equal(merged.entries.find((e) => e.country === 'ro')?.video?.live, 'yn0YmI0dPb8');
  assert.equal(merged.entries.find((e) => e.country === 'fi')?.odds, '1/1');
  assert.equal(merged.venue, 'Wiener Stadthalle');

  const withVid = setVideo(c2026, 'bg', { live: 'abcdefghijk' });
  assert.deepEqual(summarise({ 2026: withVid }, { 2026: c2026 }), ['2026: 1 video linked']);
  assert.deepEqual(summarise({ 2026: null }, { 2026: c2026 }), ['2026: results removed']);
  assert.deepEqual(summarise({ 2026: c2026 }, { 2026: c2026 }), []);
  assert.deepEqual(summarise({ 1999: { ...c2026, year: 1999 } }, {}), ['1999: 35 entries imported, 1 video linked']);
  const cleared = setVideo(c2026, 'ro', { live: '' });
  assert.equal(cleared.entries.find((e) => e.country === 'ro')?.video, undefined);
});

test('countryView lists every entry newest first, with wins from the archive', () => {
  const contests = { 2026: c2026, 2025: { ...c2026, year: 2025, city: 'Basel', hostCode: 'ch', entries: c2026.entries.map((e) => (e.country === 'bg' ? { ...e, place: 3 } : e)) } };
  const archive = {
    1956: { year: 1956, city: 'Lugano', host: 'ch', winner: 'ch', artist: 'Lys Assia', song: 'Refrain' },
    2025: { year: 2025, city: 'Basel', host: 'ch', winner: 'at' },
    2026: { year: 2026, city: 'Vienna', host: 'at', winner: 'bg' },
  };
  const bg = countryView('bg', contests, archive, countries);
  assert.deepEqual(bg.entries.map((e) => [e.year, e.place, e.roLabel]), [[2026, 1, 'Vienna 2026'], [2025, 3, 'Basel 2025']]);
  assert.deepEqual(bg.stats.map((s) => s.v), [2, 1, '1st', 2025]);
  assert.deepEqual(bg.counts, { all: 2, final: 2, top10: 2, win: 1 });
  const ch = countryView('ch', contests, archive, countries);
  const lugano = ch.entries.find((e) => e.year === 1956)!;
  assert.equal(lugano.winnerOnly, true);
  assert.equal(lugano.artist, 'Lys Assia');
  assert.match(ch.coverage, /1956 isn’t on file yet/);
  assert.equal(countryView('at', contests, archive, countries).entries.find((e) => e.year === 2026)?.hosted, true);
  assert.equal(slugify('Bosnia and Herzegovina'), 'bosnia-and-herzegovina');
  assert.equal(slugify('Serbia & Montenegro'), 'serbia-and-montenegro');
});
