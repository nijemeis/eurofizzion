// Eurofizzion CMS. Edits are drafts held in this browser; "Publish changes" commits them all in one
// commit, which triggers one Netlify build. Ported from the prototype's Eurofizzion CMS.dc.html.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ArchiveRow, Contest, Countries, Entry } from '../../lib/types';
import { parseWiki } from '../../lib/wiki';
import { bestFor, parseYouTubeId, type Candidate } from '../../lib/youtube';
import { mergeImport, setVideo, stable, summarise } from '../../lib/cms';
import { ord } from '../../lib/derive';
import type { Feed, NewsItem } from '../../lib/news';
import News from './News';

type NewsData = { picks: NewsItem[]; feeds: Feed[] };
type Data = { contests: Record<number, Contest>; archive: Record<number, ArchiveRow>; countries: Countries; news: NewsData; builtAt: string };
type Drafts = Record<number, Contest | null>; // null = remove the published results
type NewsDraft = Partial<NewsData>; // only the parts the editor changed
type Published = { at: string; files: Drafts; news?: NewsDraft };
type Tab = 'results' | 'videos' | 'publish';
type Msg = { text: string; kind: '' | 'ok' | 'err' };

const DRAFTS_KEY = 'eurofizzion-drafts';
const PUBLISHED_KEY = 'eurofizzion-published';
const NEWS_KEY = 'eurofizzion-news-drafts';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: drafts stay in memory for this session */
  }
};
const flag = (c?: string | null) => (c ? `url(/flags/${c}.svg)` : 'none');
const ytSearch = (q: string) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

export default function App({ data }: { data: Data }) {
  const C = data.countries;
  const A = data.archive;
  const [drafts, setDrafts] = useState<Drafts>(() => load(DRAFTS_KEY, {}));
  // Files published from this browser that the running build may not include yet.
  const [recent, setRecent] = useState<Published | null>(() => {
    const p = load<Published | null>(PUBLISHED_KEY, null);
    return p && p.at > data.builtAt ? p : null;
  });
  const published = useMemo(() => {
    const out: Record<number, Contest> = { ...data.contests };
    for (const [y, c] of Object.entries(recent?.files || {})) {
      if (c) out[+y] = c;
      else delete out[+y];
    }
    return out;
  }, [recent]);
  const publishedNews: NewsData = { ...data.news, ...(recent?.news || {}) };
  const [newsDraft, setNewsDraft] = useState<NewsDraft>(() => load(NEWS_KEY, {}));
  const [view, setView] = useState<'year' | 'news'>('year');
  const [newsTab, setNewsTab] = useState<'edit' | 'publish'>('edit');
  useEffect(() => save(NEWS_KEY, Object.keys(newsDraft).length ? newsDraft : null), [newsDraft]);
  const picks = newsDraft.picks ?? publishedNews.picks;
  const feeds = newsDraft.feeds ?? publishedNews.feeds;
  // A news draft identical to what's published isn't a change.
  const putNews = (k: keyof NewsData, v: NewsItem[] | Feed[]) =>
    setNewsDraft((d) => {
      const next = { ...d, [k]: v };
      if (same(v, publishedNews[k])) delete next[k];
      return next;
    });
  const newsChanged = (Object.keys(newsDraft) as (keyof NewsData)[]).filter((k) => !same(newsDraft[k], publishedNews[k]));

  const years = useMemo(
    () => [...new Set([...Object.keys(A), ...Object.keys(published), ...Object.keys(drafts)].map(Number))].sort((a, b) => b - a),
    [published, drafts],
  );
  const [year, setYear] = useState(() => Math.max(...Object.keys(data.contests).map(Number)));
  const [tab, setTab] = useState<Tab>('results');
  const [preview, setPreview] = useState<Entry[] | null>(null);
  const [msg, setMsg] = useState<Msg>({ text: '', kind: '' });
  const [busy, setBusy] = useState(false);
  const [official, setOfficial] = useState(true);
  const [cands, setCands] = useState<Record<string, Candidate[]>>({});
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const [prog, setProg] = useState('');
  const [pub, setPub] = useState<{ busy: boolean; error?: string; done?: { sha: string; commitUrl: string; deploysUrl: string | null; lines: string[] } }>({ busy: false });
  const stopRef = useRef(false);
  // Latest drafts, for async loops that outlive a render.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => save(DRAFTS_KEY, Object.keys(drafts).length ? drafts : null), [drafts]);

  const current = (y: number): Contest | undefined => (y in draftsRef.current ? draftsRef.current[y] || undefined : published[y]);
  const isDraft = (y: number) => y in drafts && (drafts[y] === null ? !!published[y] : !published[y] || stable(published[y]) !== stable(drafts[y]!));
  const statusOf = (y: number) => (isDraft(y) ? 'draft' : published[y] ? 'published' : A[y] && !A[y].winner ? 'cancelled' : 'winner');
  const putDraft = (y: number, c: Contest | null) => {
    const next = { ...draftsRef.current, [y]: c };
    // A draft identical to what's published isn't a change.
    if ((c === null && !published[y]) || (c && published[y] && stable(published[y]) === stable(c))) delete next[y];
    draftsRef.current = next;
    setDrafts(next);
  };

  const pick = (y: number) => {
    setYear(y);
    setPreview(null);
    setMsg({ text: '', kind: '' });
    setProg('');
  };

  /* ---------- Results ---------- */
  async function importWiki(y: number) {
    setBusy(true);
    setPreview(null);
    setMsg({ text: 'Fetching the Wikipedia article…', kind: '' });
    try {
      const url = 'https://en.wikipedia.org/api/rest_v1/page/html/Eurovision_Song_Contest_' + y;
      // Api-User-Agent identifies the tool to Wikimedia, as their API etiquette asks.
      const r = await fetch(url, { headers: { 'Api-User-Agent': 'EurofizzionCMS/1.0 (https://eurofizzion.com)' } }).catch(() => fetch(url));
      if (!r.ok) throw new Error('Wikipedia returned ' + r.status);
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const out = parseWiki(doc, C);
      setPreview(out.entries.length ? out.entries : null);
      setMsg({ text: out.msg, kind: out.entries.length ? 'ok' : 'err' });
    } catch (e) {
      setMsg({ text: 'Import failed: ' + (e as Error).message, kind: 'err' });
    }
    setBusy(false);
  }
  const saveImport = () => {
    putDraft(year, mergeImport(year, preview!, current(year), A[year], C));
    setPreview(null);
    setMsg({ text: 'Saved as a draft. Publish it from the Publish tab when you’re ready.', kind: 'ok' });
  };

  /* ---------- Videos ---------- */
  const patchVideo = (y: number, i: number, patch: Record<string, string>) => {
    const cur = current(y);
    if (cur) putDraft(y, setVideo(cur, i, patch));
  };

  async function findOne(y: number, i: number) {
    const e = current(y)!.entries[i];
    const k = y + '-' + i;
    setRowMsg((s) => ({ ...s, [k]: 'Searching…' }));
    const q = new URLSearchParams({ artist: e.artist, song: e.song, year: String(y), official: official ? '1' : '0' });
    const r = await fetch('/admin/api/youtube?' + q);
    const j = await r.json().catch(() => ({ error: 'Search failed (' + r.status + ')' }));
    if (j.error) {
      setRowMsg((s) => ({ ...s, [k]: j.error }));
      throw new Error(j.error);
    }
    const list: Candidate[] = j.candidates;
    const v = current(y)?.entries[i]?.video || {};
    const patch: Record<string, string> = {};
    for (const slot of ['live', 'mv'] as const) {
      if (v[slot]) continue;
      const b = bestFor(list, slot);
      if (b) {
        patch[slot] = b.id;
        patch[slot + 'Title'] = b.title;
      }
    }
    if (Object.keys(patch).length) patchVideo(y, i, patch);
    const filled = [patch.live && 'live', patch.mv && 'music video'].filter(Boolean);
    setCands((s) => ({ ...s, [k]: list }));
    setRowMsg((s) => ({ ...s, [k]: !list.length ? 'No results' : filled.length ? 'Auto-filled ' + filled.join(' + ') : 'No confident match — pick one below' }));
  }

  async function findAll(y: number) {
    const list = current(y)?.entries || [];
    stopRef.current = false;
    setBusy(true);
    let n = 0;
    for (const e of list) {
      if (stopRef.current) break;
      n++;
      const v = current(y)?.entries[n - 1]?.video;
      if (v?.live && v?.mv) continue; // never spend quota on complete entries
      setProg('Searching ' + n + ' of ' + list.length + ': ' + e.artist + '…');
      try {
        await findOne(y, n - 1);
      } catch (err) {
        setBusy(false);
        setProg('Stopped: ' + (err as Error).message);
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    setBusy(false);
    setProg(stopRef.current ? 'Stopped.' : 'Done — checked ' + list.length + ' entries.');
  }

  /* ---------- Publish ---------- */
  const changed = Object.keys(drafts).map(Number).filter(isDraft);
  const summary = [
    ...newsChanged.map((k) => (k === 'picks' ? `News: ${picks.length} pick${picks.length === 1 ? '' : 's'}` : `News feeds: ${feeds.length}`)),
    ...summarise(Object.fromEntries(changed.map((y) => [y, drafts[y]])), published),
  ];

  async function publish() {
    setPub({ busy: true });
    const files: Record<string, string | null> = {};
    for (const y of changed) files[`contests/${y}.json`] = drafts[y] ? stable(drafts[y]!) : null;
    if (newsChanged.includes('picks')) files['news-picks.json'] = JSON.stringify({ items: picks }, null, 2) + '\n';
    if (newsChanged.includes('feeds')) files['news-feeds.json'] = JSON.stringify({ feeds }, null, 2) + '\n';
    try {
      const r = await fetch('/admin/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, message: 'CMS: ' + summary.join(' · ') }),
      });
      const j = await r.json().catch(() => ({ error: 'Publish failed (' + r.status + ')' }));
      if (j.error) throw new Error(j.error);
      const rec: Published = {
        at: new Date().toISOString(),
        files: { ...(recent?.files || {}), ...Object.fromEntries(changed.map((y) => [y, drafts[y]])) },
        news: { ...(recent?.news || {}), ...Object.fromEntries(newsChanged.map((k) => [k, newsDraft[k]])) },
      };
      save(PUBLISHED_KEY, rec);
      setRecent(rec);
      draftsRef.current = {};
      setDrafts({});
      setNewsDraft({});
      setPub({ busy: false, done: { ...j, lines: summary } });
    } catch (e) {
      setPub({ busy: false, error: (e as Error).message });
    }
  }

  /* ---------- Render ---------- */
  const decades: Record<number, number[]> = {};
  for (const y of years) (decades[Math.floor(y / 10) * 10] ||= []).push(y);
  const st = statusOf(year);
  const a = A[year];
  const cur = current(year);
  const winner = cur?.entries.find((e) => e.place === 1);
  const wc = a?.winner || winner?.country;
  const city = cur?.city || a?.city || '';
  const STATUS = {
    published: ['Published', '#ffd23f'],
    draft: ['Draft — not published yet', '#2de2f5'],
    cancelled: ['Cancelled', '#6f69a8'],
    winner: ['Winner only — not imported yet', '#a9a3e0'],
  } as const;
  const nDrafts = changed.length + newsChanged.length;

  const rowsFor = (src: Entry[]) =>
    src
      .slice()
      .sort((x, y) => +(x.place == null) - +(y.place == null) || (x.place || 0) - (y.place || 0) || x.status.localeCompare(y.status) || (x.semiPlace || 99) - (y.semiPlace || 99));

  const publishBox = (
    <div class="box">
      <p class="lead">
        Your edits are drafts saved in this browser. Publishing commits them all to GitHub in <b>one commit</b>; Netlify then rebuilds the site once (usually under a minute).
        Visitors only ever get the pre-built pages.
      </p>
      {pub.done && (
        <div class="done">
          <b>Published.</b> Commit{' '}
          <a href={pub.done.commitUrl} target="_blank" rel="noopener">
            {pub.done.sha.slice(0, 7)}
          </a>{' '}
          · {pub.done.lines.join(' · ')}
          <br />
          {pub.done.deploysUrl ? (
            <a href={pub.done.deploysUrl} target="_blank" rel="noopener">
              Netlify build started — watch the deploy log ↗
            </a>
          ) : (
            'Netlify build started.'
          )}
        </div>
      )}
      {pub.error && <div class="msg msg-err">Publish failed: {pub.error}. Your drafts are still here; try again.</div>}
      {summary.length ? (
        <>
          <ul class="summary">
            {summary.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div class="row">
            <button class="btn btn-gold" disabled={pub.busy} onClick={publish}>
              {pub.busy ? 'Publishing…' : 'Publish changes'}
            </button>
            <button
              class="btn btn-ghost"
              disabled={pub.busy}
              onClick={() => {
                if (confirm('Discard every unpublished change?')) {
                  draftsRef.current = {};
                  setDrafts({});
                  setNewsDraft({});
                }
              }}
            >
              Discard all drafts
            </button>
          </div>
          <details>
            <summary>Show the files that will be committed</summary>
            {changed.map((y) => (
              <div key={y}>
                <div class="file">content/contests/{y}.json {drafts[y] ? '' : '(deleted)'}</div>
                {drafts[y] && <textarea readOnly value={stable(drafts[y]!)} />}
              </div>
            ))}
          </details>
        </>
      ) : (
        !pub.done && <div class="msg msg-plain">No unpublished changes.</div>
      )}
    </div>
  );

  return (
    <div class="cms">
      <header class="cms-header">
        <div class="wordmark">
          <span class="euro">Euro</span>
          <span class="fizz">fizzion</span>
        </div>
        <span class="cms-pill">CMS</span>
        <span class="cms-note">
          {nDrafts ? `${nDrafts} unpublished change${nDrafts === 1 ? '' : 's'} saved in this browser` : 'Everything is published'}
          {recent && ' · last publish is building'}
        </span>
        <a href="/" class="btn btn-pink btn-sm" target="_blank" rel="noopener">
          View site ↗
        </a>
      </header>

      <div class="cms-layout">
        <aside class="cms-side">
          <button class={'side-year side-news' + (view === 'news' ? ' on' : '')} onClick={() => setView('news')}>
            <b>News</b>
            <span>
              {picks.length} pick{picks.length === 1 ? '' : 's'} · {feeds.length} feed{feeds.length === 1 ? '' : 's'}
            </span>
            {newsChanged.length > 0 && <i style={{ background: '#2de2f5' }} />}
          </button>
          <div class="side-legend">
            <span><i style="background:#ffd23f" />Published</span>
            <span><i style="background:#2de2f5" />Draft (unpublished)</span>
            <span><i style="background:rgba(255,255,255,.22)" />Winner only</span>
          </div>
          {Object.keys(decades)
            .map(Number)
            .sort((x, y) => y - x)
            .map((d) => (
              <div class="side-decade" key={d}>
                <div class="side-label">{d}s</div>
                {decades[d].map((y) => {
                  const s = statusOf(y);
                  return (
                    <button key={y} class={'side-year' + (view === 'year' && y === year ? ' on' : '')} onClick={() => (setView('year'), pick(y))}>
                      <b>{y}</b>
                      <span>{current(y)?.city || A[y]?.city || ''}</span>
                      <i style={{ background: s === 'draft' ? '#2de2f5' : s === 'published' ? '#ffd23f' : s === 'cancelled' ? 'transparent' : 'rgba(255,255,255,.22)' }} />
                    </button>
                  );
                })}
              </div>
            ))}
        </aside>

        <main class="cms-main">
          {view === 'news' ? (
            <>
              <div class="cms-title">
                <div>
                  <div class="cms-status" style={{ color: newsChanged.length ? '#2de2f5' : '#ffd23f' }}>{newsChanged.length ? 'Draft — not published yet' : 'Published'}</div>
                  <h1>News</h1>
                  <div class="cms-sub">The news bar in the next-contest section: your picks first, then the latest feed stories.</div>
                </div>
                <div class="tabs">
                  <button class={'pill' + (newsTab === 'edit' ? ' on' : '')} onClick={() => setNewsTab('edit')}>
                    Edit
                  </button>
                  <button class={'pill' + (newsTab === 'publish' ? ' on' : '')} onClick={() => setNewsTab('publish')}>
                    {nDrafts ? `Publish (${nDrafts})` : 'Publish'}
                  </button>
                </div>
              </div>
              {newsTab === 'publish' ? publishBox : <News picks={picks} feeds={feeds} setPicks={(v) => putNews('picks', v)} setFeeds={(v) => putNews('feeds', v)} />}
            </>
          ) : (
          <>
          <div class="cms-title">
            <div class="cms-who">
              <div class="ring ring-lg">
                <div class="flag" style={{ backgroundImage: flag(wc) }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div class="cms-status" style={{ color: STATUS[st][1] }}>{STATUS[st][0]}</div>
                <h1>
                  {city} {year}
                </h1>
                <div class="cms-sub">
                  {wc ? `Won by ${C[wc] || wc} — ${a?.artist || winner?.artist}, “${a?.song || winner?.song}”` : a?.note || ''}
                </div>
              </div>
            </div>
            <div class="tabs">
              {(
                [
                  ['results', 'Results'],
                  ['videos', 'Videos'],
                  ['publish', nDrafts ? `Publish (${nDrafts})` : 'Publish'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} class={'pill' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'results' && (
            <>
              <div class="box">
                <div class="row">
                  {st !== 'cancelled' && (
                    <button class="btn btn-gold" disabled={busy} onClick={() => importWiki(year)}>
                      {busy ? 'Importing…' : cur ? 'Re-import from Wikipedia' : 'Import from Wikipedia'}
                    </button>
                  )}
                  {preview && (
                    <>
                      <button class="btn btn-pink" onClick={saveImport}>
                        Save draft
                      </button>
                      <button class="btn btn-ghost" onClick={() => (setPreview(null), setMsg({ text: '', kind: '' }))}>
                        Discard preview
                      </button>
                    </>
                  )}
                  {cur && !preview && (
                    <button class="btn btn-danger" onClick={() => (putDraft(year, null), setMsg({ text: 'Results removed (draft). Publish to take them off the site.', kind: '' }))}>
                      Remove results
                    </button>
                  )}
                  {year in drafts && !preview && (
                    <button class="btn btn-ghost" onClick={() => { const n = { ...drafts }; delete n[year]; draftsRef.current = n; setDrafts(n); setMsg({ text: 'Draft discarded.', kind: '' }); }}>
                      Discard draft
                    </button>
                  )}
                  <a class="link-cyan" href={'https://en.wikipedia.org/wiki/Eurovision_Song_Contest_' + year} target="_blank" rel="noopener">
                    Open on Wikipedia ↗
                  </a>
                </div>
                <div class={'msg msg-' + (msg.kind || 'plain')}>
                  {msg.text ||
                    (st === 'cancelled'
                      ? `No contest was held in ${year}.`
                      : cur
                        ? cur.source === 'Wikipedia' && cur.importedAt
                          ? `Imported from Wikipedia on ${new Date(cur.importedAt).toLocaleDateString()}. Re-importing keeps the linked videos and odds.`
                          : 'Fan-compiled results. Re-import from Wikipedia to verify them; linked videos and odds are kept.'
                        : 'Pull the line-up, running order and scores from Wikipedia. You review everything before it goes live.')}
                </div>
              </div>

              {(preview || cur) && (
                <div class="table" style={{ borderColor: preview ? 'rgba(255,210,63,.55)' : undefined }}>
                  <div class="tr th">
                    <span>Pl.</span>
                    <span>Country</span>
                    <span>Artist</span>
                    <span>Song</span>
                    <span class="r">Jury</span>
                    <span class="r">Tele</span>
                    <span class="r">Total</span>
                    <span>Stage</span>
                  </div>
                  {rowsFor(preview || cur!.entries).map((e) => {
                    const total = e.total ?? (e.jury != null && e.televote != null ? e.jury + e.televote : null);
                    const semi = e.status === 'SF2' ? 'Semi 2' : e.status === 'SF' ? 'Semi' : 'Semi 1';
                    return (
                      <div class="tr" key={e.country + e.song}>
                        <span class="pl" style={{ color: e.place === 1 ? '#ffd23f' : undefined }}>{e.place || '—'}</span>
                        <span class="who">
                          <i class="flag" style={{ backgroundImage: flag(e.country) }} />
                          <b>{C[e.country] || e.country}</b>
                        </span>
                        <span class="ell">{e.artist}</span>
                        <span class="ell gold">{e.song}</span>
                        <span class="r jury">{e.jury ?? '—'}</span>
                        <span class="r tele">{e.televote ?? '—'}</span>
                        <span class="r"><b>{total ?? '—'}</b></span>
                        <span class="stage">
                          {e.status === 'A'
                            ? 'Final · auto-qualified'
                            : e.status === 'DQ'
                              ? 'Disqualified'
                              : e.status.startsWith('SF')
                                ? semi + (e.semiPlace ? ' · ' + ord(e.semiPlace) : '')
                                : e.place
                                  ? 'Final'
                                  : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'videos' && (
            <>
              <div class="box">
                <div class="row">
                  <button class="btn btn-gold" disabled={busy || !cur} onClick={() => findAll(year)}>
                    {busy ? 'Searching…' : `Find videos for all ${cur?.entries.length || 0} entries`}
                  </button>
                  {busy && (
                    <button class="btn btn-ghost" onClick={() => (stopRef.current = true)}>
                      Stop
                    </button>
                  )}
                  <span class="prog">{prog}</span>
                  <label class="check">
                    <input type="checkbox" checked={official} onChange={(e) => setOfficial((e.target as HTMLInputElement).checked)} />
                    Only search the official Eurovision Song Contest channel
                  </label>
                  {cur && (
                    <span class="counts">
                      {cur.entries.filter((e) => e.video?.live).length}/{cur.entries.length} live · {cur.entries.filter((e) => e.video?.mv).length}/{cur.entries.length} music videos
                    </span>
                  )}
                </div>
                <div class="hint">
                  Fills only the empty slots, using titles that match the artist and song (“Live”, “Grand Final” → live; “Official Music Video” → music video). Each lookup costs about 100 of
                  the free 10,000 daily API units, so roughly 100 entries a day. Entries that already have both videos are skipped. You can always paste a link instead.
                </div>
              </div>

              {!cur && <div class="empty-box">Import this contest’s results first — videos are linked per entry.</div>}

              {cur?.entries.map((e, i) => {
                const k = year + '-' + i;
                const v = e.video || {};
                const list = (cands[k] || []).map((x) => ({ ...x, used: x.id === v.live || x.id === v.mv }));
                const assign = (slot: 'live' | 'mv') => {
                  const id = parseYouTubeId(paste[k] || '');
                  if (!id) return setRowMsg((s) => ({ ...s, [k]: 'That doesn’t look like a YouTube link.' }));
                  patchVideo(year, i, { [slot]: id, [slot + 'Title']: '' });
                  setPaste((s) => ({ ...s, [k]: '' }));
                  setRowMsg((s) => ({ ...s, [k]: 'Linked.' }));
                };
                return (
                  <div class="vrow" key={k}>
                    <div class="vgrid">
                      <div class="who">
                        <span class="ring">
                          <span class="flag" style={{ backgroundImage: flag(e.country) }} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div class="vcountry">{C[e.country] || e.country}</div>
                          <div class="ell"><b>{e.artist}</b></div>
                          <div class="ell gold">{e.song}</div>
                        </div>
                      </div>
                      {(
                        [
                          ['live', 'Live performance', '#ff8fd6'],
                          ['mv', 'Music video', '#4fe8f7'],
                        ] as const
                      ).map(([slot, label, col]) => {
                        const id = v[slot];
                        return (
                          <div key={slot} class={'slot' + (id ? ' has' : '')}>
                            <div class="slot-thumb" style={{ backgroundImage: id ? `url(https://i.ytimg.com/vi/${id}/mqdefault.jpg)` : 'none' }}>
                              {id ? '' : '▶'}
                            </div>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div class="slot-label" style={{ color: col }}>{label}</div>
                              <div class="slot-title">{id ? v[(slot + 'Title') as 'liveTitle'] || 'youtu.be/' + id : 'Not linked yet'}</div>
                              <div class="slot-actions">
                                <a href={ytSearch(`${e.artist} ${e.song} Eurovision ${year}${slot === 'live' ? ' live' : ' official music video'}`)} target="_blank" rel="noopener" class="link-cyan">
                                  Search ↗
                                </a>
                                {id && (
                                  <>
                                    <a href={'https://youtu.be/' + id} target="_blank" rel="noopener" class="link-muted">
                                      Watch
                                    </a>
                                    <button class="link-pink" onClick={() => patchVideo(year, i, { [slot]: '', [slot + 'Title']: '' })}>
                                      Clear
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div class="row">
                      <input
                        class="paste"
                        value={paste[k] || ''}
                        onInput={(ev) => setPaste((s) => ({ ...s, [k]: (ev.target as HTMLInputElement).value }))}
                        placeholder="Paste a YouTube link"
                      />
                      <button class="btn btn-sm btn-out-pink" onClick={() => assign('live')}>
                        → Live
                      </button>
                      <button class="btn btn-sm btn-out-cyan" onClick={() => assign('mv')}>
                        → Music video
                      </button>
                      <button class="btn btn-sm btn-gold" disabled={busy} onClick={() => findOne(year, i).catch(() => {})}>
                        Find on YouTube
                      </button>
                      <span class="rowmsg">{rowMsg[k] || ''}</span>
                    </div>
                    {list.length > 0 && (
                      <div class="cands">
                        {list.map((x) => (
                          <div class="cand" key={x.id} style={{ borderColor: x.used ? 'rgba(255,210,63,.7)' : undefined }}>
                            <div class="cand-thumb" style={{ backgroundImage: `url(${x.thumb})` }}>
                              <span class={'kind kind-' + x.kind}>{x.kind === 'live' ? 'Live' : x.kind === 'mv' ? 'Music video' : 'Other'}</span>
                              <span class="match">{Math.round(x.match * 100)}% match</span>
                            </div>
                            <div class="cand-title">{x.title}</div>
                            <div class="cand-channel">{x.channel}</div>
                            <div class="cand-actions">
                              <button class="btn btn-xs btn-out-pink" onClick={() => patchVideo(year, i, { live: x.id, liveTitle: x.title })}>
                                Use as live
                              </button>
                              <button class="btn btn-xs btn-out-cyan" onClick={() => patchVideo(year, i, { mv: x.id, mvTitle: x.title })}>
                                Use as MV
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'publish' && publishBox}
          </>
          )}
        </main>
      </div>
    </div>
  );
}
