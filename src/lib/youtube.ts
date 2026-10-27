// YouTube candidate scoring for the CMS, ported from the prototype's search(). Shared by the
// youtube-search function (which scores results) and the CMS (which auto-fills empty slots).
import { norm } from './wiki.ts';

export type Kind = 'live' | 'mv' | 'other';
export type Candidate = { id: string; title: string; channel: string; thumb: string; match: number; kind: Kind };
export type RawItem = { id: string; title: string; channel: string; thumb: string };

const toks = (x: string) => norm(x).split(' ').filter((w) => w.length > 1);

export function scoreItems(items: RawItem[], artist: string, song: string, year: number): Candidate[] {
  const ST = toks(song), AT = toks(artist);
  return items.map((it) => {
    const T = ' ' + norm(it.title) + ' ';
    const hit = (arr: string[]) => (arr.length ? arr.filter((w) => T.includes(' ' + w + ' ')).length / arr.length : 0);
    const match = hit(ST) * 0.6 + hit(AT) * 0.4;
    const bad = /rehearsal|reaction|cover|karaoke|lyric|instrumental|preview|recap|snippet|interview|press/.test(T);
    let kind: Kind = bad
      ? 'other'
      : /official (music )?video|music video|videoclip|video clip/.test(T)
        ? 'mv'
        : /live|grand final|semi final|first semi|second semi/.test(T)
          ? 'live'
          : 'other';
    if (kind === 'other' && !bad && year < 2000) kind = 'live';
    return { ...it, match, kind };
  });
}

// Best candidate of the right kind at >= 50% match, or nothing.
export const bestFor = (cands: Candidate[], slot: 'live' | 'mv') =>
  cands.filter((x) => x.kind === slot && x.match >= 0.5).sort((a, b) => b.match - a.match)[0];

export function parseYouTubeId(v: string) {
  const s = v.trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
