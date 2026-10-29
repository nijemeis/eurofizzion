// CMS only: reads one page the editor pasted into the News form and returns its title, image,
// excerpt and date from the page's share tags. Runs only when the editor clicks "Fill in".
import type { Config } from '@netlify/functions';
import { checkAuth, json } from '../lib/auth.ts';
import { parsePage, safeUrl } from '../../src/lib/news.ts';

export default async (req: Request) => {
  const denied = checkAuth(req, process.env.CMS_PASSWORD);
  if (denied) return denied;
  const url = safeUrl(new URL(req.url).searchParams.get('url') || '');
  if (!url) return json({ error: 'Give a full http(s) link' }, 400);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'EurofizzionCMS/1.0 link preview (+https://eurofizzion.com; sing@eurofizzion.com)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return json({ error: `The site answered ${r.status}; fill in the details by hand.` }, 502);
    const item = parsePage((await r.text()).slice(0, 500_000), r.url || url);
    if (!item) return json({ error: 'No title found on that page; fill in the details by hand.' }, 422);
    return json({ item });
  } catch (e) {
    return json({ error: `Couldn't read that page (${(e as Error).message}); fill in the details by hand.` }, 502);
  }
};

export const config: Config = { path: '/admin/api/preview', method: 'GET' };
