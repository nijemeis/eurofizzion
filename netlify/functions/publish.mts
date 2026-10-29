// CMS only: commits every changed content file (contests, news picks, feed list) to GitHub in ONE commit.
// Netlify then rebuilds the site once, on that push. Nothing is committed per click.
import type { Config } from '@netlify/functions';
import { checkAuth, json } from '../lib/auth.ts';

type Body = { files: Record<string, string | null>; message?: string };

const PATH_RE = /^contests\/(\d{4})\.json$/;
// Besides contest files, the CMS may write the editor's news picks and the feed list.
const NEWS_FILES: Record<string, (v: any) => boolean> = {
  'news-picks.json': (v) => Array.isArray(v?.items) && v.items.every((n: any) => typeof n?.title === 'string' && /^https?:\/\//.test(n?.url)),
  'news-feeds.json': (v) => Array.isArray(v?.feeds) && v.feeds.every((f: any) => /^https?:\/\//.test(f?.url)),
};

export default async (req: Request) => {
  const denied = checkAuth(req, process.env.CMS_PASSWORD);
  if (denied) return denied;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/name"
  const branch = process.env.GITHUB_BRANCH || 'main';
  const dir = (process.env.CONTENT_DIR || 'content').replace(/\/+$/, '');
  if (!token || !repo) return json({ error: 'GITHUB_TOKEN and GITHUB_REPO must be set in the Netlify environment.' }, 503);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const entries = Object.entries(body.files || {});
  if (!entries.length) return json({ error: 'Nothing to publish' }, 400);

  // Only these files can be written: the news files in their expected shape, and contest files
  // that are valid contests for their own year.
  for (const [path, content] of entries) {
    if (NEWS_FILES[path]) {
      try {
        if (content === null || !NEWS_FILES[path](JSON.parse(content))) throw new Error();
      } catch {
        return json({ error: `${path} is not valid` }, 400);
      }
      continue;
    }
    const m = path.match(PATH_RE);
    if (!m) return json({ error: `Refusing to write ${path}` }, 400);
    if (content === null) continue;
    try {
      const c = JSON.parse(content);
      if (c.year !== Number(m[1]) || !Array.isArray(c.entries)) throw new Error('bad shape');
    } catch {
      return json({ error: `${path} is not a valid contest file` }, 400);
    }
  }

  const gh = async (path: string, init?: RequestInit) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'eurofizzion-cms',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${data.message || r.statusText}`);
    return data;
  };

  try {
    const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const parentSha: string = ref.object.sha;
    const parent = await gh(`/git/commits/${parentSha}`);
    const tree = await gh('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        // sha: null deletes the file (when results are removed in the CMS).
        tree: entries.map(([path, content]) =>
          content === null
            ? { path: `${dir}/${path}`, mode: '100644', type: 'blob', sha: null }
            : { path: `${dir}/${path}`, mode: '100644', type: 'blob', content },
        ),
      }),
    });
    const years = entries.map(([p]) => p.match(PATH_RE)?.[1] ?? p.replace('.json', '')).join(', ');
    const commit = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: (body.message || `CMS: update ${years}`).slice(0, 2000),
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    // Not a force update: if someone pushed in the meantime GitHub refuses and the editor can retry.
    await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });

    const site = process.env.SITE_NAME;
    return json({
      sha: commit.sha,
      commitUrl: `https://github.com/${repo}/commit/${commit.sha}`,
      deploysUrl: site ? `https://app.netlify.com/sites/${site}/deploys` : null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};

export const config: Config = { path: '/admin/api/publish', method: 'POST' };
