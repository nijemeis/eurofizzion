// Every derived value the pages show, computed once at build time.
// Ported from the prototype's renderVals(); kept free of content imports so it can be unit-tested.
import type { ArchiveRow, Contest, Countries, Entry } from './types';

export const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export type Badge = 'winner' | 'top' | 'rest' | 'semi';
export const badgeOf = (place: number | null): Badge =>
  place === 1 ? 'winner' : place && place <= 10 ? 'top' : place ? 'rest' : 'semi';

export const ytSearch = (q: string) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

export type EntryView = {
  c: string;
  country: string;
  artist: string;
  song: string;
  place: number | null;
  jury: number | null;
  tele: number | null;
  total: number | null;
  oddsRank: number | null;
  odds: string;
  live: string;
  mv: string;
  badge: Badge;
  placeLabel: string;
  roLabel: string;
  subLabel: string;
  formats: string;
  thumb: string;
  isSemi: boolean;
};

export function entryView(e: Entry, year: number, C: Countries): EntryView {
  const { country: c, place: p, jury: j, televote: tv, status: st } = e;
  const total = e.total != null ? e.total : j != null && tv != null ? j + tv : null;
  const isSemi = !!st && st.startsWith('SF');
  const semi = st === 'SF2' ? 'Semi-final 2' : st === 'SF' ? 'Semi-final' : 'Semi-final 1';
  const live = e.video?.live || '';
  const mv = e.video?.mv || '';
  const id = live || mv;
  return {
    c,
    country: C[c] || c.toUpperCase(),
    artist: e.artist,
    song: e.song,
    place: p,
    jury: j,
    tele: tv,
    total,
    oddsRank: e.oddsRank,
    odds: e.odds || '',
    live,
    mv,
    badge: badgeOf(p),
    placeLabel: p === 1 ? '★ Winner' : p ? ord(p) : st === 'DQ' ? 'Disqualified' : isSemi ? 'Semi-finalist' : 'Took part',
    roLabel: e.runningOrder ? 'Nº ' + e.runningOrder : st === 'A' ? 'Auto-qualified' : isSemi ? semi.replace('-final', '') : String(year),
    subLabel: p
      ? j != null && tv != null
        ? total + ' pts · ' + j + ' jury · ' + tv + ' televote'
        : total != null
          ? total + ' points'
          : ''
      : st === 'DQ'
        ? 'Removed before the final'
        : isSemi
          ? semi + (e.semiPlace ? ' · ' + ord(e.semiPlace) + (e.semiPoints != null ? ' with ' + e.semiPoints + ' pts' : '') : ' · did not qualify')
          : '',
    formats: live && mv ? '▶ Live · MV' : live ? '▶ Live' : '▶ Music video',
    thumb: id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '',
    isSemi,
  };
}

export type Stat = { v: string | number; l: string; tone: 'gold' | 'jury' | 'tele' | 'plain' };

export type Spotlight = {
  kicker: string;
  code: string | null; // flag; null for the cancelled year
  country: string;
  artist: string;
  song: string;
  stats: Stat[];
  note: string;
  canWatch: boolean;
};

export type BoardRow = EntryView & { place: number; score: number };

export type Highlight = { kicker: string; tone: 'jury' | 'tele' | 'gold'; c: string; country: string; value: string | number; desc: string };

export type OddsRow = {
  c: string;
  country: string;
  oddsLabel: string;
  oddsX: number;
  placeX: number;
  segL: number;
  segW: number;
  dir: 'up' | 'down' | 'same';
  isWinner: boolean;
  deltaLabel: string;
};

export type FullView = {
  kind: 'full';
  year: number;
  yearTitle: string;
  sub: string;
  spot: Spotlight;
  entries: EntryView[]; // finalists by placing, then non-qualifiers
  counts: { all: number; final: number; semi: number } | null; // null = no filter pills
  hasSplit: boolean;
  finals: EntryView[];
  maxTotal: number;
  revealOrder: string[];
  highlights: Highlight[];
  oddsRows: OddsRow[];
  oddsInsight: string;
  oddsNote: string;
  lastPlace: string;
};

export type EmptyView = {
  kind: 'empty';
  year: number;
  yearTitle: string;
  sub: string;
  spot: Spotlight;
  emptyTitle: string;
  emptyText: string;
};

export function contestView(Y: Contest, C: Countries, A?: ArchiveRow): FullView {
  const year = Y.year;
  const all = Y.entries.map((e) => entryView(e, year, C));
  const finals = all.filter((e) => e.place).sort((a, b) => a.place! - b.place!);
  const nq = all.filter((e) => !e.place);
  const N = finals.length;
  const hasSplit = N > 0 && finals.every((e) => e.jury != null && e.tele != null);
  const winner = finals[0] || all[0];
  const second = finals[1];
  const yearTitle = Y.city + ' ' + year;
  const maxTotal = Math.max(1, ...finals.map((e) => e.total || 0));

  const stats: Stat[] = [];
  if (winner && winner.total != null) {
    stats.push({ v: winner.total, l: 'points', tone: 'gold' });
    if (hasSplit) stats.push({ v: winner.jury!, l: 'jury', tone: 'jury' }, { v: winner.tele!, l: 'televote', tone: 'tele' });
    if (second && second.total != null) stats.push({ v: '+' + (winner.total - second.total), l: 'vs ' + second.country, tone: 'plain' });
  }
  const spot: Spotlight = {
    kicker: '★ Winner · ' + yearTitle,
    code: winner?.c ?? null,
    country: winner?.country ?? '',
    artist: winner?.artist ?? '',
    song: winner?.song ?? '',
    stats,
    note: Y.note || A?.note || '',
    canWatch: !!winner,
  };

  const revealOrder = finals
    .slice()
    .sort((a, b) => a.jury! - b.jury! || b.place! - a.place!)
    .map((e) => e.c);

  let highlights: Highlight[] = [];
  if (hasSplit) {
    const top = (key: 'jury' | 'tele') => finals.reduce((a, b) => (b[key]! > a[key]! ? b : a));
    const jt = top('jury');
    const tt = top('tele');
    const gap = finals.reduce((a, b) => (Math.abs(b.jury! - b.tele!) > Math.abs(a.jury! - a.tele!) ? b : a));
    highlights = [
      { kicker: 'Jury favourite', tone: 'jury', c: jt.c, country: jt.country, value: jt.jury!, desc: jt.artist + ' — “' + jt.song + '” · finished ' + ord(jt.place!) },
      { kicker: 'Televote favourite', tone: 'tele', c: tt.c, country: tt.country, value: tt.tele!, desc: tt.artist + ' — “' + tt.song + '” · finished ' + ord(tt.place!) },
      {
        kicker: 'Biggest jury vs public split',
        tone: 'gold',
        c: gap.c,
        country: gap.country,
        value: gap.jury + ' / ' + gap.tele,
        desc: gap.jury! > gap.tele! ? 'The juries loved it far more than the viewers did' : 'The viewers loved it far more than the juries did',
      },
    ];
  }

  const x = (n: number) => (N > 1 ? ((n - 1) / (N - 1)) * 100 : 0);
  const oddsRows: OddsRow[] = finals
    .filter((e) => e.oddsRank)
    .sort((a, b) => a.oddsRank! - b.oddsRank!)
    .map((e) => {
      const d = e.oddsRank! - e.place!;
      return {
        c: e.c,
        country: e.country,
        oddsLabel: e.odds || '#' + e.oddsRank,
        oddsX: x(e.oddsRank!),
        placeX: x(e.place!),
        segL: x(Math.min(e.oddsRank!, e.place!)),
        segW: N > 1 ? (Math.abs(d) / (N - 1)) * 100 : 0,
        dir: d > 0 ? 'up' : d < 0 ? 'down' : 'same',
        isWinner: e.place === 1,
        deltaLabel: d > 0 ? '▲ ' + d + ' up' : d < 0 ? '▼ ' + -d + ' down' : 'Spot on',
      };
    });
  const favRow = oddsRows[0];
  let oddsInsight = '';
  if (favRow) {
    const fav = finals.find((e) => e.c === favRow.c)!;
    const fo = fav.odds ? ' at ' + fav.odds : '';
    oddsInsight =
      fav.place === 1
        ? 'The favourite delivered: ' + fav.country + ' went in top of the betting' + fo + ' and won.'
        : fav.country +
          ' went in as the bookies’ favourite' +
          fo +
          ' and finished ' +
          ord(fav.place!) +
          '. ' +
          (winner.oddsRank
            ? winner.country + ' won from ' + ord(winner.oddsRank) + ' in the betting' + (winner.odds ? ' (' + winner.odds + ')' : '') + '.'
            : winner.country + ' won from outside the top ' + oddsRows.length + ' in the betting.');
  }
  const oddsNote = Y.sourced
    ? 'Pre-final winner odds as listed by Oddschecker on the day of the final.'
    : 'Approximate pre-final betting order for the top ' + oddsRows.length + ' — fan-compiled.';

  const sub = [all.length + ' songs'];
  if (nq.length) sub.push(N + ' in the Grand Final');
  if (Y.date) sub.push(Y.date);
  if (Y.venue) sub.push(Y.venue);
  if (Y.source === 'Wikipedia') sub.push('Results via Wikipedia');

  return {
    kind: 'full',
    year,
    yearTitle,
    sub: sub.join(' · '),
    spot,
    entries: finals.concat(nq),
    counts: nq.length ? { all: all.length, final: N, semi: nq.length } : null,
    hasSplit,
    finals,
    maxTotal,
    revealOrder,
    highlights,
    oddsRows,
    oddsInsight,
    oddsNote,
    lastPlace: ord(Math.max(N, 1)),
  };
}

export function emptyView(year: number, A: ArchiveRow | undefined, C: Countries): EmptyView {
  const city = A?.city || '';
  const wc = A?.winner;
  const yearTitle = (city + ' ' + year).trim();
  return {
    kind: 'empty',
    year,
    yearTitle,
    sub: wc ? 'Only the winner is on file for this contest so far.' : '',
    emptyTitle: wc ? 'Results coming soon' : 'No contest this year',
    emptyText: wc
      ? 'The full line-up and scoreboard for ' + yearTitle + ' haven’t been added yet.'
      : 'The ' + year + ' contest in ' + city + ' was cancelled because of the COVID-19 pandemic.',
    spot: wc
      ? { kicker: '★ Winner · ' + yearTitle, code: wc, country: C[wc] || wc, artist: A?.artist || '', song: A?.song || '', stats: [], note: A?.note || '', canWatch: false }
      : {
          kicker: 'Cancelled · ' + yearTitle,
          code: null,
          country: city + ', ' + (C[A?.host || ''] || ''),
          artist: 'No contest',
          song: '',
          stats: [],
          note: 'Broadcasters aired the special Eurovision: Europe Shine a Light instead.',
          canWatch: false,
        },
  };
}

export type ChipState = 'selected' | 'full' | 'winner' | 'cancelled';
export type Decade = { label: string; years: { year: number; state: ChipState; title: string }[] };

export function decades(allYears: number[], current: number, archive: Record<number, ArchiveRow>, fullYears: Set<number>, C: Countries): Decade[] {
  const map: Record<number, number[]> = {};
  for (const y of allYears) (map[Math.floor(y / 10) * 10] ||= []).push(y);
  return Object.keys(map)
    .map(Number)
    .sort((a, b) => b - a)
    .map((d) => ({
      label: d + 's',
      years: map[d]
        .slice()
        .sort((a, b) => a - b)
        .map((y) => {
          const a = archive[y];
          const wc = a?.winner;
          return {
            year: y,
            state: y === current ? 'selected' : fullYears.has(y) ? 'full' : wc ? 'winner' : 'cancelled',
            title: (a?.city || '') + ' ' + y + (wc ? ' · won by ' + (C[wc] || wc) : ' · cancelled'),
          };
        }),
    }));
}

// Small seeded PRNG so sparkle positions are identical on every build (no layout churn between deploys).
export function sparkles(count: number, seed: number) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const colors = ['#ffd23f', '#ff3fb4', '#2de2f5', '#ffffff', '#b04dff', '#ff9f2e'];
  return Array.from({ length: count }, (_, i) => ({
    x: +(rnd() * 100).toFixed(2),
    y: +(rnd() * 100).toFixed(2),
    size: +(6 + rnd() * 14).toFixed(1),
    delay: +(rnd() * 4).toFixed(2),
    dur: +(2.2 + rnd() * 3).toFixed(2),
    color: colors[i % 6],
  }));
}
