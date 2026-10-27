import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import publish from '../netlify/functions/publish.mts';
import youtube from '../netlify/functions/youtube-search.mts';

const auth = 'Basic ' + btoa('editor:s3cret');
type Call = { url: string; method: string; body: any };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  Object.assign(process.env, { CMS_PASSWORD: 's3cret', GITHUB_TOKEN: 't', GITHUB_REPO: 'me/eurofizzion', YOUTUBE_API_KEY: 'k', SITE_NAME: 'eurofizzion' });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const reply = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (url.includes('/git/ref/heads/')) return reply({ object: { sha: 'parent1' } });
    if (url.endsWith('/git/commits/parent1')) return reply({ tree: { sha: 'tree0' } });
    if (url.endsWith('/git/trees')) return reply({ sha: 'tree1' });
    if (url.endsWith('/git/commits')) return reply({ sha: 'commit1' });
    if (url.includes('/git/refs/heads/')) return reply({});
    if (url.includes('googleapis.com/youtube')) {
      return reply({
        items: [{ id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'Nemo - The Code | Grand Final | Eurovision 2024 &#39;live&#39;', channelTitle: 'Eurovision Song Contest', thumbnails: { medium: { url: 'm.jpg' } } } }],
      });
    }
    throw new Error('unexpected fetch ' + url);
  }) as typeof fetch;
});

const post = (body: unknown, headers: Record<string, string> = { authorization: auth }) =>
  new Request('https://x.test/admin/api/publish', { method: 'POST', headers, body: JSON.stringify(body) });

test('publish refuses without the password', async () => {
  const r = await publish(post({ files: {} }, {}));
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
});

test('publish fails closed when CMS_PASSWORD is unset', async () => {
  delete process.env.CMS_PASSWORD;
  assert.equal((await publish(post({ files: {} }))).status, 503);
});

test('publish only writes contest files', async () => {
  const r = await publish(post({ files: { 'netlify.toml': 'x' } }));
  assert.equal(r.status, 400);
  const r2 = await publish(post({ files: { 'contests/2025.json': JSON.stringify({ year: 2024, entries: [] }) } }));
  assert.equal(r2.status, 400);
  assert.equal(calls.length, 0);
});

test('publish makes one commit with every file, including deletions', async () => {
  const r = await publish(post({ files: { 'contests/1999.json': JSON.stringify({ year: 1999, entries: [] }), 'contests/2025.json': null }, message: 'CMS: test' }));
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.sha, 'commit1');
  assert.equal(j.deploysUrl, 'https://app.netlify.com/sites/eurofizzion/deploys');
  const tree = calls.find((c) => c.url.endsWith('/git/trees'))!.body;
  assert.equal(tree.base_tree, 'tree0');
  assert.deepEqual(tree.tree.map((t: any) => [t.path, t.sha === null ? 'delete' : 'write']), [
    ['content/contests/1999.json', 'write'],
    ['content/contests/2025.json', 'delete'],
  ]);
  const commits = calls.filter((c) => c.url.endsWith('/git/commits') && c.method === 'POST');
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].body.parents, ['parent1']);
  const ref = calls.find((c) => c.method === 'PATCH')!;
  assert.deepEqual(ref.body, { sha: 'commit1', force: false });
});

test('youtube search scores results and keeps the key server-side', async () => {
  const r = await youtube(new Request('https://x.test/admin/api/youtube?artist=Nemo&song=The%20Code&year=2024&official=1', { headers: { authorization: auth } }));
  const j = await r.json();
  assert.equal(j.candidates[0].kind, 'live');
  assert.equal(j.candidates[0].title, "Nemo - The Code | Grand Final | Eurovision 2024 'live'");
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('channelId'), 'UCRpjHHu8ivVWs73uxHlWwFA');
  assert.equal(u.searchParams.get('q'), 'Nemo The Code Eurovision 2024');
  assert.ok(!JSON.stringify(j).includes('"k"'));
});
