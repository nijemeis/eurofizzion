// Client behaviour for the public pages: countdown, time machine, filters, scoreboard and video modal.
// All data is already in the page; nothing here calls a server.

type E = {
  c: string;
  country: string;
  artist: string;
  song: string;
  place: number | null;
  jury: number | null;
  tele: number | null;
  total: number | null;
  live: string;
  mv: string;
  badge: string;
  placeLabel: string;
  subLabel: string;
};
type Data = { year: number; yearTitle: string; hasSplit: boolean; maxTotal: number; revealOrder: string[]; entries: E[] };

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dataEl = document.getElementById('contest-data');
const D: Data | null = dataEl ? JSON.parse(dataEl.textContent || 'null') : null;
const byCode = new Map((D?.entries || []).map((e) => [e.c, e]));
const pressed = (els: HTMLElement[], on: (el: HTMLElement) => boolean) => els.forEach((el) => el.setAttribute('aria-pressed', String(on(el))));

/* ---------- Countdown ---------- */
const cd = $('[data-countdown]');
if (cd) {
  const target = Date.parse(cd.dataset.countdown!);
  const cells = Object.fromEntries($$('[data-unit]', cd).map((el) => [el.dataset.unit, el]));
  const pad = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    const ms = Math.max(0, target - Date.now());
    cells.days.textContent = String(Math.floor(ms / 864e5));
    cells.hours.textContent = pad(Math.floor(ms / 36e5) % 24);
    cells.minutes.textContent = pad(Math.floor(ms / 6e4) % 60);
    cells.seconds.textContent = pad(Math.floor(ms / 1e3) % 60);
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Time machine ---------- */
const tm = $('[data-tm]');
const tmBtn = $('[data-tm-open]');
const setPicker = (open: boolean) => {
  tm.hidden = !open;
  tmBtn.setAttribute('aria-expanded', String(open));
  if (open) $<HTMLElement>('.chip-selected, .chip', tm).focus();
};
tmBtn.addEventListener('click', () => setPicker(tm.hidden !== false));
tm.addEventListener('click', (ev) => {
  if (ev.target === tm) setPicker(false);
});

/* ---------- Entry filters ---------- */
const filterBtns = $$('[data-filter]');
filterBtns.forEach((btn) =>
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    pressed(filterBtns, (b) => b === btn);
    $$('.card[data-stage]').forEach((card) => (card.hidden = f !== 'all' && card.dataset.stage !== f));
  }),
);

/* ---------- Scoreboard ---------- */
const board = $('[data-board]');
if (board && D) {
  const finals = D.entries.filter((e) => e.place).sort((a, b) => a.place! - b.place!);
  const N = finals.length;
  const rows = new Map($$('.brow', board).map((r) => [r.dataset.c!, r]));
  const sortBtns = $$('[data-sort]', board);
  const sortsWrap = $('[data-sorts]', board);
  const revealBtn = $('[data-reveal]', board);
  const tag = $('[data-phase-tag]', board);
  const text = $('[data-phase-text]', board);
  const labels: Record<string, string> = { total: 'total', jury: 'jury', tele: 'televote' };
  const pct = (n: number) => (n / D.maxTotal) * 100 + '%';
  let sort: 'total' | 'jury' | 'tele' = 'total';
  let reveal: number | null = null;
  let timer = 0;
  const speed = 900;

  const render = () => {
    const R = reveal;
    const revealed = new Set(R == null ? finals.map((e) => e.c) : D.revealOrder.slice(0, R));
    const current = R ? byCode.get(D.revealOrder[R - 1])! : null;
    const scoreOf = (e: E) => (R != null ? e.jury! + (revealed.has(e.c) ? e.tele! : 0) : sort === 'total' ? e.total! : sort === 'jury' ? e.jury! : e.tele!);
    const ranked = finals.slice().sort((a, b) => scoreOf(b) - scoreOf(a) || a.place! - b.place!);
    ranked.forEach((e, i) => {
      const row = rows.get(e.c)!;
      const showTele = revealed.has(e.c) && !(R == null && sort === 'jury');
      const showJury = !(R == null && sort === 'tele');
      row.style.setProperty('--rank', String(i));
      row.classList.toggle('lead', i === 0);
      row.classList.toggle('cur', !!current && current.c === e.c);
      $('[data-rank]', row).textContent = String(i + 1);
      $('[data-score]', row).textContent = String(scoreOf(e));
      $('[data-t]', row).textContent = 'T ' + (revealed.has(e.c) ? e.tele : '—');
      $('.bj', row).style.width = showJury ? pct(e.jury!) : '0%';
      $('.bt', row).style.width = showTele ? pct(e.tele!) : '0%';
    });
    sortsWrap.hidden = R != null;
    pressed(sortBtns, (b) => b.dataset.sort === sort);
    const winner = finals[0];
    if (R == null) {
      tag.textContent = 'Final results';
      text.textContent = 'Ranked by ' + labels[sort] + ' points. Hit play to relive the televote reveal.';
    } else if (R === 0) {
      tag.textContent = 'Juries';
      text.textContent = 'The juries have spoken. Now for the points from the viewers at home…';
    } else if (R < N) {
      tag.textContent = 'Televote ' + R + '/' + N;
      text.textContent = current!.country + ' receives ' + current!.tele + ' points from the public!';
    } else {
      tag.textContent = '★ Winner';
      text.textContent = winner.country + ' wins ' + D.yearTitle + ' with ' + winner.total + ' points!';
    }
    revealBtn.textContent = R == null ? '▶ Play the vote reveal' : R < N ? 'Skip to the result' : '↺ Back to full results';
  };

  const stop = () => {
    clearInterval(timer);
    reveal = null;
    render();
  };
  revealBtn?.addEventListener('click', () => {
    if (reveal != null) return stop();
    reveal = 0;
    render();
    timer = window.setInterval(
      () => {
        reveal = Math.min((reveal ?? 0) + 1, N);
        if (reveal >= N) clearInterval(timer);
        render();
      },
      reduced ? 1200 : speed,
    );
  });
  sortBtns.forEach((b) =>
    b.addEventListener('click', () => {
      sort = b.dataset.sort as typeof sort;
      render();
    }),
  );
}

/* ---------- Video modal ---------- */
const modal = $('[data-modal]');
if (modal && D) {
  const frame = $('[data-m-frame]', modal);
  const empty = $('[data-m-empty]', modal);
  const tabs = $$('[data-m-tab]', modal);
  let open: E | null = null;
  let vtype: 'live' | 'mv' = 'live';
  let lastFocus: HTMLElement | null = null;

  const show = () => {
    const e = open!;
    const vid = vtype === 'live' ? e.live : e.mv;
    tabs.forEach((t) => {
      const k = t.dataset.mTab as 'live' | 'mv';
      t.classList.toggle('on', k === vtype);
      t.classList.toggle('has', !!e[k]);
      t.setAttribute('aria-pressed', String(k === vtype));
    });
    // Lite embed: the YouTube iframe only exists while the modal is open on a video.
    frame.innerHTML = '';
    if (vid) {
      const f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + vid + '?autoplay=1&rel=0';
      f.title = e.country + ' — ' + e.artist + ', ' + e.song;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      frame.append(f);
    }
    empty.hidden = !!vid;
    const q = e.country + ' ' + e.artist + ' ' + e.song + ' Eurovision ' + D.year + ' ' + (vtype === 'live' ? 'live' : 'official music video');
    $<HTMLAnchorElement>('[data-m-search]', modal).href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
    $('[data-m-empty-text]', modal).textContent = vtype === 'live' ? 'No live performance linked yet' : 'No official music video linked yet';
  };

  const openModal = (c: string) => {
    const e = byCode.get(c);
    if (!e) return;
    open = e;
    vtype = e.live ? 'live' : e.mv ? 'mv' : 'live';
    const flag = 'url(/flags/' + e.c + '.svg)';
    $('[data-m-flag]', modal).style.backgroundImage = flag;
    $('[data-m-blur]', modal).style.backgroundImage = flag;
    $('[data-m-label]', modal).textContent = e.country + ' · ' + D.yearTitle;
    const badge = $('[data-m-badge]', modal);
    badge.className = 'badge badge-' + e.badge;
    badge.textContent = e.placeLabel;
    $('[data-m-artist]', modal).textContent = e.artist;
    $('[data-m-song]', modal).textContent = e.song;
    const finalist = !!e.place && e.jury != null;
    $('[data-m-stats]', modal).hidden = !finalist;
    if (finalist) {
      $('[data-m-total]', modal).textContent = String(e.total);
      $('[data-m-jury]', modal).textContent = String(e.jury);
      $('[data-m-tele]', modal).textContent = String(e.tele);
      $('[data-m-jw]', modal).style.width = (e.jury! / (e.total || 1)) * 100 + '%';
      $('[data-m-tw]', modal).style.width = (e.tele! / (e.total || 1)) * 100 + '%';
    }
    $('[data-m-sub]', modal).textContent = e.subLabel;
    lastFocus = document.activeElement as HTMLElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    show();
    $('[data-m-close]', modal).focus();
  };

  const closeModal = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    frame.innerHTML = '';
    document.body.style.overflow = '';
    lastFocus?.focus();
  };

  document.addEventListener('click', (ev) => {
    const t = (ev.target as Element).closest<HTMLElement>('[data-open]');
    if (t) openModal(t.dataset.open!);
  });
  document.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    if ((ev.key === 'Enter' || ev.key === ' ') && t.matches?.('.brow[data-open]')) {
      ev.preventDefault();
      openModal(t.dataset.open!);
    }
  });
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) closeModal();
  });
  $('[data-m-close]', modal).addEventListener('click', closeModal);
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      vtype = t.dataset.mTab as 'live' | 'mv';
      show();
    }),
  );
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeModal();
  });
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && tm.hidden === false) {
    setPicker(false);
    tmBtn.focus();
  }
});
