// Pure helpers for the CMS: building a contest from an import, and summarising drafts before publish.
import type { ArchiveRow, Contest, Countries, Entry, Video } from './types.ts';

// An import replaces the line-up and scores, but keeps what the editor added by hand:
// videos and odds per country, and the contest's venue, date, note and edition.
export function mergeImport(year: number, imported: Entry[], existing: Contest | undefined, a: ArchiveRow | undefined, C: Countries): Contest {
  // Match by country and song first, so two entries from one country (1956) keep their own videos.
  const bySong = new Map((existing?.entries || []).map((e) => [e.country + '|' + e.song.toLowerCase(), e]));
  const old = new Map((existing?.entries || []).map((e) => [e.country, e]));
  const entries = imported.map((e) => {
    const o = bySong.get(e.country + '|' + e.song.toLowerCase()) || old.get(e.country);
    const out: Entry = { ...e };
    if (o?.oddsRank != null) out.oddsRank = o.oddsRank;
    if (o?.odds) out.odds = o.odds;
    if (o?.video) out.video = o.video;
    return out;
  });
  return {
    year,
    city: existing?.city || a?.city || '',
    host: existing?.host || C[a?.host || ''] || '',
    hostCode: existing?.hostCode || a?.host,
    venue: existing?.venue,
    date: existing?.date,
    edition: existing?.edition,
    note: existing?.note,
    source: 'Wikipedia',
    sourced: existing?.sourced ?? false,
    importedAt: new Date().toISOString(),
    entries,
  };
}

// By entry index, not country: in 1956 every country sent two songs.
export function setVideo(c: Contest, index: number, patch: Partial<Video>): Contest {
  return {
    ...c,
    entries: c.entries.map((e, i) => {
      if (i !== index) return e;
      const video: Video = { ...e.video, ...patch };
      for (const k of Object.keys(video) as (keyof Video)[]) if (!video[k]) delete video[k];
      const { video: _old, ...rest } = e;
      return Object.keys(video).length ? { ...rest, video } : rest;
    }),
  };
}

const videoCount = (c: Contest | null | undefined) =>
  (c?.entries || []).reduce((n, e) => n + (e.video?.live ? 1 : 0) + (e.video?.mv ? 1 : 0), 0);

export const stable = (c: Contest) => JSON.stringify(c, null, 2) + '\n';

// One line per changed year, e.g. "2025: 37 entries imported · 2026: 14 videos linked".
export function summarise(drafts: Record<number, Contest | null>, published: Record<number, Contest>): string[] {
  return Object.keys(drafts)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap((y) => {
      const d = drafts[y];
      const p = published[y];
      if (d === null) return p ? [y + ': results removed'] : [];
      if (p && stable(p) === stable(d)) return [];
      const bits: string[] = [];
      const entriesChanged = !p || JSON.stringify(p.entries.map(stripVideo)) !== JSON.stringify(d.entries.map(stripVideo));
      if (entriesChanged) bits.push(d.entries.length + ' entries ' + (p ? 're-imported' : 'imported'));
      const dv = videoCount(d) - videoCount(p);
      if (dv > 0) bits.push(dv + ' video' + (dv === 1 ? '' : 's') + ' linked');
      else if (dv < 0) bits.push(-dv + ' video' + (dv === -1 ? '' : 's') + ' removed');
      else if (!entriesChanged) bits.push('videos changed');
      return [y + ': ' + bits.join(', ')];
    });
}

const stripVideo = ({ video: _v, ...rest }: Entry) => rest;
