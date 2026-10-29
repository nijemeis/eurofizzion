// CMS news editor: the editor's own picks (shown first in the news bar) and the RSS/Atom feeds the daily
// GitHub Action reads. Changes are drafts until "Publish changes".
import { useState } from 'preact/hooks';
import { newsDate, safeUrl, sourceName, type Feed, type NewsItem } from '../../lib/news';

type Props = {
  picks: NewsItem[];
  feeds: Feed[];
  setPicks: (p: NewsItem[]) => void;
  setFeeds: (f: Feed[]) => void;
};

const blank = { url: '', title: '', image: '', excerpt: '', date: new Date().toISOString().slice(0, 10), source: '' };
const val = (e: Event) => (e.target as HTMLInputElement).value;

export default function News({ picks, feeds, setPicks, setFeeds }: Props) {
  const [tab, setTab] = useState<'picks' | 'feeds'>('picks');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [msg, setMsg] = useState({ text: '', kind: '' });
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState({ name: '', url: '' });
  const set = (k: keyof typeof blank) => (e: Event) => setForm((f) => ({ ...f, [k]: val(e) }));

  async function fillIn() {
    const url = safeUrl(form.url);
    if (!url) return setMsg({ text: 'Paste a full link first (https://…).', kind: 'err' });
    setBusy(true);
    setMsg({ text: 'Reading the page…', kind: '' });
    try {
      const r = await fetch('/admin/api/preview?url=' + encodeURIComponent(url));
      const j = await r.json().catch(() => ({ error: 'Preview failed (' + r.status + ')' }));
      if (j.error) throw new Error(j.error);
      const n: NewsItem = j.item;
      // Keep anything the editor already typed.
      setForm((f) => ({
        url: f.url,
        title: f.title || n.title,
        image: f.image || n.image || '',
        excerpt: f.excerpt || n.excerpt,
        date: n.date ? n.date.slice(0, 10) : f.date,
        source: f.source || n.source,
      }));
      setMsg({ text: 'Filled in from the page. Check it, then add it.', kind: 'ok' });
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: 'err' });
    }
    setBusy(false);
  }

  function save() {
    const url = safeUrl(form.url);
    if (!url || !form.title.trim()) return setMsg({ text: 'A link and a title are needed.', kind: 'err' });
    const item: NewsItem = {
      title: form.title.trim(),
      url,
      date: form.date ? new Date(form.date + 'T12:00:00Z').toISOString() : null,
      excerpt: form.excerpt.trim(),
      image: safeUrl(form.image) || null,
      source: form.source.trim() || sourceName(url),
    };
    setPicks(editing == null ? [item, ...picks] : picks.map((p, i) => (i === editing ? item : p)));
    setForm(blank);
    setEditing(null);
    setMsg({ text: 'Saved as a draft. Publish to put it on the site.', kind: 'ok' });
  }

  const edit = (i: number) => {
    const p = picks[i];
    setEditing(i);
    setForm({ url: p.url, title: p.title, image: p.image || '', excerpt: p.excerpt, date: p.date ? p.date.slice(0, 10) : '', source: p.source });
    setMsg({ text: '', kind: '' });
  };

  function addFeed() {
    const url = safeUrl(feed.url);
    if (!url) return;
    if (feeds.some((f) => f.url === url)) return setMsg({ text: 'That feed is already in the list.', kind: 'err' });
    setFeeds([...feeds, { name: feed.name.trim() || sourceName(url), url }]);
    setFeed({ name: '', url: '' });
    setMsg({ text: 'Feed added as a draft. After publishing, it’s read at the next daily run.', kind: 'ok' });
  }

  return (
    <>
      <div class="tabs">
        <button class={'pill' + (tab === 'picks' ? ' on' : '')} onClick={() => setTab('picks')}>
          Your picks ({picks.length})
        </button>
        <button class={'pill' + (tab === 'feeds' ? ' on' : '')} onClick={() => setTab('feeds')}>
          Feeds ({feeds.length})
        </button>
      </div>

      {tab === 'picks' && (
        <>
          <div class="box">
            <p class="lead">
              Stories you add here appear <b>first</b> in the news bar in the next-contest section, newest first. Feed stories fill the rest, up to 8 cards in total.
            </p>
            <div class="news-form">
              <label class="wide">
                Link
                <span class="row">
                  <input value={form.url} onInput={set('url')} placeholder="https://…" />
                  <button class="btn btn-sm btn-gold" disabled={busy} onClick={fillIn}>
                    {busy ? 'Reading…' : 'Fill in from the page'}
                  </button>
                </span>
              </label>
              <label class="wide">
                Title
                <input value={form.title} onInput={set('title')} />
              </label>
              <label class="wide">
                Short text
                <textarea class="short" value={form.excerpt} onInput={set('excerpt')} maxLength={240} />
              </label>
              <label class="wide">
                Image link
                <input value={form.image} onInput={set('image')} placeholder="https://… (optional)" />
              </label>
              <label>
                Date
                <input type="date" value={form.date} onInput={set('date')} />
              </label>
              <label>
                Source
                <input value={form.source} onInput={set('source')} placeholder="e.g. eurovision.com" />
              </label>
            </div>
            <div class="row">
              <button class="btn btn-pink" onClick={save}>
                {editing == null ? 'Add story' : 'Save changes'}
              </button>
              {editing != null && (
                <button class="btn btn-ghost" onClick={() => (setEditing(null), setForm(blank))}>
                  Cancel
                </button>
              )}
              <span class={'msg msg-' + (msg.kind || 'plain')}>{msg.text}</span>
            </div>
          </div>

          {picks.length === 0 && <div class="empty-box">No picks yet.</div>}
          {picks.map((p, i) => (
            <div class="pick" key={p.url}>
              <div class="pick-img" style={{ backgroundImage: p.image ? `url(${p.image})` : 'none' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div class="pick-meta">
                  {newsDate(p.date)} · {p.source}
                </div>
                <div class="ell">
                  <b>{p.title}</b>
                </div>
                <div class="pick-text">{p.excerpt}</div>
              </div>
              <div class="pick-actions">
                <a class="link-cyan" href={p.url} target="_blank" rel="noopener">
                  Open ↗
                </a>
                <button class="link-muted btn-link" onClick={() => edit(i)}>
                  Edit
                </button>
                <button class="link-pink btn-link" onClick={() => setPicks(picks.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'feeds' && (
        <div class="box">
          <p class="lead">
            RSS or Atom feeds to fill the news bar automatically. A GitHub Action reads them once a day and only triggers a Netlify build when there’s something new. Use
            feeds from sites that offer them for sharing headlines.
          </p>
          <div class="row">
            <input class="paste" value={feed.url} onInput={(e) => setFeed((f) => ({ ...f, url: val(e) }))} placeholder="Feed link, e.g. https://example.com/feed/" />
            <input class="paste" style={{ maxWidth: '220px' }} value={feed.name} onInput={(e) => setFeed((f) => ({ ...f, name: val(e) }))} placeholder="Name shown on cards" />
            <button class="btn btn-sm btn-gold" onClick={addFeed}>
              Add feed
            </button>
            <span class={'msg msg-' + (msg.kind || 'plain')}>{msg.text}</span>
          </div>
          {feeds.length === 0 && <div class="msg msg-plain">No feeds yet.</div>}
          {feeds.map((f, i) => (
            <div class="feed-row" key={f.url}>
              <b>{f.name}</b>
              <a class="ell link-cyan" href={f.url} target="_blank" rel="noopener">
                {f.url}
              </a>
              <button class="link-pink btn-link" onClick={() => setFeeds(feeds.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
