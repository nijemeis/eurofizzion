// CMS only: proxies one YouTube Data API search so the API key stays on the server.
// Each call costs 100 of the 10,000 free daily quota units.
import type { Config } from '@netlify/functions';
import { checkAuth, json } from '../lib/auth.ts';
import { scoreItems, type RawItem } from '../../src/lib/youtube.ts';

// Official Eurovision Song Contest channel.
const OFFICIAL_CHANNEL = 'UCRpjHHu8ivVWs73uxHlWwFA';

const decode = (s: string) =>
  s.replace(/&(#39|quot|amp|lt|gt|#(\d+));/g, (m, name, code) =>
    code ? String.fromCharCode(+code) : ({ '#39': "'", quot: '"', amp: '&', lt: '<', gt: '>' } as Record<string, string>)[name] ?? m,
  );

export default async (req: Request) => {
  const denied = checkAuth(req, process.env.CMS_PASSWORD);
  if (denied) return denied;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return json({ error: 'YOUTUBE_API_KEY is not set in the Netlify environment.' }, 503);

  const u = new URL(req.url);
  const artist = u.searchParams.get('artist') || '';
  const song = u.searchParams.get('song') || '';
  const year = Number(u.searchParams.get('year'));
  if (!artist || !song || !year) return json({ error: 'artist, song and year are required' }, 400);

  const p = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '8',
    videoEmbeddable: 'true',
    q: `${artist} ${song} Eurovision ${year}`,
    key,
  });
  if (u.searchParams.get('official') === '1') p.set('channelId', OFFICIAL_CHANNEL);

  const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p);
  const j = await r.json();
  if (j.error) {
    const quota = (j.error.errors || []).some((e: { reason?: string }) => /quota/i.test(e.reason || ''));
    return json({ error: j.error.message || 'YouTube API error', quota }, quota ? 429 : 502);
  }
  const items: RawItem[] = (j.items || [])
    .filter((it: any) => it.id?.videoId)
    .map((it: any) => ({
      id: it.id.videoId,
      title: decode(it.snippet.title || ''),
      channel: decode(it.snippet.channelTitle || ''),
      thumb: (it.snippet.thumbnails?.medium || it.snippet.thumbnails?.default || {}).url || '',
    }));
  return json({ candidates: scoreItems(items, artist, song, year) });
};

export const config: Config = { path: '/admin/api/youtube', method: 'GET' };
