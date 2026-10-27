// Parses a Wikipedia "Eurovision Song Contest {year}" article (Parsoid HTML from the REST API) into entries.
// Ported from the prototype's parseWiki(). Works on any DOM Document: the browser's DOMParser in the CMS,
// linkedom in the tests.
import type { Countries, Entry, Status } from './types.ts';

export const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ALIASES: Record<string, string> = {
  'czech republic': 'cz',
  macedonia: 'mk',
  'fyr macedonia': 'mk',
  'f y r macedonia': 'mk',
  'west germany': 'de',
  'bosnia herzegovina': 'ba',
  'the netherlands': 'nl',
  holland: 'nl',
  'great britain': 'gb',
  uk: 'gb',
  turkiye: 'tr',
  'russian federation': 'ru',
};

export function codeMap(countries: Countries) {
  const m: Record<string, string> = {};
  for (const [c, n] of Object.entries(countries)) m[norm(n)] = c;
  return Object.assign(m, ALIASES);
}

type Row = { c: string; artist: string; song: string; points: number | null; place: number | null; ro: number | null };
type Kind = 'F' | 'SF1' | 'SF2' | 'SF' | 'X';

export function parseWiki(doc: Document, countries: Countries): { entries: Entry[]; msg: string } {
  const map = codeMap(countries);
  // First non-empty line of a cell, without footnotes.
  const line = (el: Element | undefined) => {
    if (!el) return '';
    const x = el.cloneNode(true) as Element;
    x.querySelectorAll('sup, style, .reference').forEach((n) => n.remove());
    x.querySelectorAll('br').forEach((b) => b.replaceWith(doc.createTextNode('\n')));
    return ((x.textContent || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const code = (el: Element | undefined) => map[norm(line(el))] || null;
  const num = (el: Element | undefined) => {
    const m = line(el).replace(/,/g, '').match(/^-?\d+/);
    return m ? +m[0] : null;
  };
  const kindOf = (h: string): Kind | null =>
    /qualif|kvalif|pre-?selection|national/i.test(h)
      ? null
      : /semi/i.test(h)
        ? /(2|two|second)/i.test(h)
          ? 'SF2'
          : /(1|one|first)/i.test(h)
            ? 'SF1'
            : 'SF'
        : /final/i.test(h)
          ? 'F'
          : 'X';

  let heading = '';
  const res: { kind: Kind; list: Row[] }[] = [];
  const splits: Record<string, { jury: number; tele: number }>[] = [];

  doc.querySelectorAll('h2, h3, h4, table').forEach((el) => {
    if (el.tagName !== 'TABLE') {
      heading = (el.textContent || '').trim();
      return;
    }
    if (!el.classList.contains('wikitable')) return;
    const kind = kindOf(heading);
    if (!kind) return;
    const rows = [...el.querySelectorAll('tr')];
    const hr = rows.find((r) => r.querySelector('th') && !r.querySelector('td'));
    const H = hr ? [...hr.children].map((c) => line(c).toLowerCase()) : [];
    const col = (re: RegExp) => H.findIndex((h) => re.test(h));
    const ci = col(/country/), ai = col(/artist|performer/), si = col(/^song/), pi = col(/points/), li = col(/^place/), ri = col(/^(r\/o|draw|running)/);

    if (ci >= 0 && si >= 0 && (pi >= 0 || li >= 0)) {
      // A results table: one row per country.
      const list: Row[] = [];
      rows.forEach((r) => {
        const cells = [...r.children];
        if (r === hr || !r.querySelector('td') || cells.length < H.length) return;
        const c = code(cells[ci]);
        if (!c) return;
        list.push({
          c,
          artist: line(cells[ai]),
          song: line(cells[si]).replace(/^[\s"“”]+|[\s"“”]+$/g, ''),
          points: pi >= 0 ? num(cells[pi]) : null,
          place: li >= 0 ? num(cells[li]) : null,
          ro: ri >= 0 ? num(cells[ri]) : null,
        });
      });
      if (list.length) res.push({ kind, list });
    } else if (kind === 'F' || kind === 'X') {
      // A jury/televote split table: three numbers per country, one of which is the sum of the other two.
      const htxt = rows.filter((r) => !r.querySelector('td')).map((r) => r.textContent).join(' ').toLowerCase();
      const jPos = htxt.search(/jury/), tPos = htxt.search(/televot/);
      if (jPos < 0 || tPos < 0) return;
      const m: Record<string, { jury: number; tele: number }> = {};
      rows.forEach((r) => {
        const cells = [...r.children];
        let k = -1, c: string | null = null;
        for (let i = 0; i < cells.length; i++) {
          c = code(cells[i]);
          if (c) {
            k = i;
            break;
          }
        }
        if (k < 0 || !c) return;
        const n: number[] = [];
        for (let i = k + 1; i < cells.length && n.length < 3; i++) {
          const v = num(cells[i]);
          if (v == null) break;
          n.push(v);
        }
        if (n.length < 3) return;
        const ti = n.findIndex((v, i) => v === n.filter((_, j) => j !== i).reduce((a, b) => a + b, 0));
        if (ti < 0) return;
        const rest = n.filter((_, j) => j !== ti);
        m[c] = jPos < tPos ? { jury: rest[0], tele: rest[1] } : { jury: rest[1], tele: rest[0] };
      });
      if (Object.keys(m).length > 3) splits.push(m);
    }
  });

  const fin = res.find((t) => t.kind === 'F') || res.find((t) => t.kind === 'X');
  if (!fin) return { entries: [], msg: 'Couldn’t find a results table on that Wikipedia page. Open it and check the article layout.' };
  const semis = res.filter((t) => t.kind.startsWith('SF'));
  const sp = Object.assign({}, ...splits) as Record<string, { jury: number; tele: number }>;
  if (fin.list.every((e) => e.place == null) && fin.list.some((e) => e.points != null)) {
    const sorted = fin.list.slice().sort((a, b) => (b.points || 0) - (a.points || 0));
    fin.list.forEach((e) => (e.place = sorted.findIndex((x) => (x.points || 0) === (e.points || 0)) + 1));
  }
  const fc = new Set(fin.list.map((e) => e.c));
  const inSemi = new Set(semis.flatMap((t) => t.list.map((e) => e.c)));
  const entries: Entry[] = fin.list.map((e) => {
    const s = sp[e.c];
    return {
      country: e.c,
      artist: e.artist,
      song: e.song,
      place: e.place,
      jury: s ? s.jury : null,
      televote: s ? s.tele : null,
      total: e.points ?? (s ? s.jury + s.tele : null),
      oddsRank: null,
      status: semis.length && !inSemi.has(e.c) ? 'A' : '',
      runningOrder: e.ro,
    };
  });
  let nq = 0;
  for (const t of semis)
    for (const e of t.list) {
      if (fc.has(e.c) || entries.some((x) => x.country === e.c)) continue;
      nq++;
      entries.push({
        country: e.c,
        artist: e.artist,
        song: e.song,
        place: null,
        jury: null,
        televote: null,
        total: null,
        oddsRank: null,
        status: t.kind as Status,
        runningOrder: null,
        semiPlace: e.place,
        semiPoints: e.points,
      });
    }
  const hasSplit = fin.list.every((e) => sp[e.c]);
  return {
    entries,
    msg:
      'Found ' + fin.list.length + ' finalists' + (nq ? ' and ' + nq + ' semi-final non-qualifiers' : '') +
      (hasSplit ? ', with the jury/televote split' : '') + '. Check the preview below, then save.',
  };
}
