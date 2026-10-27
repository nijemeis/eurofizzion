// Password-protects /admin/* (the CMS page and its API) before anything else runs.
// Only editors hit these paths, so this costs nothing for normal visitors.
import type { Config, Context } from '@netlify/edge-functions';
import { checkAuth } from '../lib/auth.ts';

export default async (req: Request, context: Context) => {
  const denied = checkAuth(req, Netlify.env.get('CMS_PASSWORD'));
  if (denied) return denied;
  const res = await context.next();
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
};

export const config: Config = { path: '/admin/*' };
