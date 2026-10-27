# Handoff: Eurofizzion — Eurovision fan site + CMS

## Overview
Eurofizzion (eurofizzion.eu / eurofizzion.com) is an unofficial Eurovision Song Contest fan site. It has two parts:

1. **Public site** — one page per contest year (1956 → today, plus the next contest). For each year: winner spotlight, video grid of every entry (YouTube: live performance + official music video), scoreboard with jury/televote split and an animated "vote reveal", bookmaker odds vs actual result, and a countdown/teaser for the upcoming contest.
2. **CMS** — an editor-only tool to import a year's results from Wikipedia, find YouTube videos for each entry (semi-automatic via the YouTube Data API), and publish.

**Hard requirement from the owner:** it must run on **Netlify as a static site**. No database queries or API calls at page-view time. The CMS writes content, then triggers **one rebuild**; visitors only ever get pre-built static HTML/JSON. Keep Netlify build minutes and API quota usage low.

## About the design files
The files in `design/` are **design references built in HTML**. They are prototypes showing the intended look and behaviour, not production code to copy. Rebuild them in a real framework; the recommended stack is below. Open `design/Eurofizzion v2.dc.html` and `design/Eurofizzion CMS.dc.html` in a browser to click through them; they need `support.js` and `esc-data.js` next to them.

The prototype is a single page: "pages" are faked with React state, and data comes from one JS file plus `localStorage`. Production should use real static routes per year, with content as JSON files in the git repo.

## Fidelity
**High-fidelity.** Colours, type, radii, spacing, copy and interactions are final. Recreate them pixel-close. The screenshots in `screenshots/` are 924px-wide captures of the live prototype.

---

## Recommended architecture (Netlify, static, rebuild-on-publish)

```
repo/
  content/
    countries.json          # { "bg": "Bulgaria", ... }
    archive.json            # every year: city, host, winner (for winner-only years)
    upcoming.json           # next contest: city, venue, show dates, participants
    contests/2026.json      # full results per year (only years that have been imported)
    contests/2025.json ...
  src/                      # Astro (recommended) or Next.js static export / Eleventy
  netlify/functions/
    wiki-import.ts          # CMS only: fetch + parse Wikipedia → JSON preview
    youtube-search.ts       # CMS only: proxies the YouTube Data API (key stays server-side)
    publish.ts              # CMS only: commits changed content/*.json to GitHub in ONE commit
  netlify.toml
```

**Build time (Astro, `output: 'static'`)**
- Generate `/` (the latest contest) and `/{year}/` for every year in `archive.json`. Years with no `contests/{year}.json` render the "winner only" layout.
- Do every derived value at build time: rankings, jury/tele favourites, biggest split, odds movement, "won from Nth in the betting" sentence, semi-final labels. Ship these as props or inline JSON to small client "islands".
- Self-host the flags (e.g. the `flag-icons` npm package as SVG) instead of hot-linking flagcdn.com. Yugoslavia and Serbia & Montenegro need custom flags.
- Self-host the fonts (Fontsource packages) to avoid the Google Fonts request.

**Runtime (visitor) — zero backend calls**
- The countdown, year picker, filters, scoreboard sort, vote reveal and video modal are all client-side, using data already in the page.
- Video thumbnails come straight from `https://i.ytimg.com/vi/{id}/hqdefault.jpg`. Only mount the YouTube iframe when someone clicks play (a "lite embed" pattern), using `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0`.
- The prototype lets a visitor paste a YouTube link into the modal, saved in their browser. **Remove that from the public site**: videos should come only from the CMS. Keep the "Find it on YouTube ↗" search link as the fallback when no video exists.

**CMS → rebuild flow**
1. The editor opens `/admin` (protected — see auth below).
2. Edits are **drafts held in the browser** (IndexedDB/localStorage), exactly as the prototype does. Nothing is committed per click.
3. **Import from Wikipedia** calls the `wiki-import` function, which returns a preview. The editor reviews it, then clicks "Save draft".
4. **Find videos** calls the `youtube-search` function, one call per entry. Auto-fill is shown; the editor confirms or picks another.
5. **Publish** calls the `publish` function, which commits all changed `content/*.json` files in **a single commit** via the GitHub API. Netlify rebuilds automatically on push to `main`. (Alternatively, commit with `[skip netlify]` and POST a Netlify Build Hook explicitly.)
6. One publish means one build. Astro builds about 75 pages in well under a minute.

**Auth for /admin** (pick one)
- **Simplest / zero cost:** don't deploy the CMS at all. Run it locally (`npm run cms`); it writes directly to `content/`, and you `git push`. The functions become local dev endpoints.
- **Hosted:** protect `/admin/*` and `/.netlify/functions/*` with an Edge Function checking a password or JWT, or use Netlify's site password protection on a separate admin site. Store `GITHUB_TOKEN` (fine-grained, contents:write on this repo only) and `YOUTUBE_API_KEY` as Netlify environment variables.
- Alternative off-the-shelf option: Decap CMS with the GitHub backend for the plain editing UI, plus the two custom functions for import and video lookup.

**Cost and quota notes**
- The YouTube Data API `search.list` costs 100 units; the free quota is 10,000 units a day, so about 100 entry lookups a day. "Find all" must skip entries that already have both videos (the prototype does this) and stop on a quota error.
- Wikipedia: one REST call per import (`https://en.wikipedia.org/api/rest_v1/page/html/Eurovision_Song_Contest_{year}`). Send a descriptive `User-Agent` from the function.
- Check Netlify's current plan limits for build minutes and function invocations. With batch publishing, usage should stay tiny.

---

## Data model

The prototype stores entries as positional tuples (see `design/esc-data.js`). Use objects in production:

```ts
type Entry = {
  country: string;          // ISO-ish code: "bg", "gb", "yu" (Yugoslavia), "cs" (Serbia & Montenegro)
  artist: string;
  song: string;
  place: number | null;     // final placing; null = didn't reach the final
  jury: number | null;      // null for years without a published split (pre-2016)
  televote: number | null;
  total: number | null;     // explicit total; = jury + televote when both exist
  oddsRank: number | null;  // position in the pre-final betting
  odds?: string;            // e.g. "4/1"
  status: '' | 'A' | 'SF1' | 'SF2' | 'SF' | 'DQ'; // A = auto-qualified (Big 5 + host)
  runningOrder: number | null;
  semiPlace?: number | null;
  semiPoints?: number | null;
  video?: { live?: string; liveTitle?: string; mv?: string; mvTitle?: string }; // YouTube IDs
};
type Contest = {
  year: number; city: string; host: string; venue?: string; date?: string; edition?: number;
  note?: string;            // one-line story shown in the winner spotlight
  source?: 'bundled' | 'Wikipedia'; sourced?: boolean; // sourced = odds are from a named bookmaker snapshot
  entries: Entry[];
};
type ArchiveRow = { year: number; city: string; host: string; winner?: string; artist?: string; song?: string; note?: string };
```

**Data accuracy:** the 2026 results and odds came from public sources. The 2023–2025 scores and odds order, and the winner archive (1956–2022), were compiled from memory in the prototype. **Re-import or verify every year from Wikipedia before launch.** The ID used for the official Eurovision YouTube channel (`UCRpjHHu8ivVWs73uxHlWwFA`) is also from memory — verify it.

---

## Screens — public site

Max content width 1320px, side padding 24px. The page background is `#090d35` with three large radial glows (pink at top-left, cyan at top-right, blue at the bottom).

### 1. Sticky header — `screenshots/site-01-hero-countdown.png`
- Height about 60px, `rgba(9,13,53,.72)` with `backdrop-filter: blur(16px)`, 1px bottom border `rgba(255,255,255,.07)`.
- **Wordmark:** "Euro" in Unbounded 800 22px with a pink→purple gradient (`#ff3fb4→#b04dff`) as text fill, then "fizzion" in **Pacifico** 24px with a gold gradient (`#ffe066→#ff9f2e→#ff3fb4`, top to bottom). Pacifico is used only in the wordmark.
- **Links:** Entries, Scoreboard, Odds, Burgas 2027 — DM Sans 500 14px, `#e8e4ff`, hover `#ffd23f`.
- **Year control** (a pill group on `rgba(255,255,255,.06)`): ‹ older | "{City} {Year} ▾" (pink→purple gradient pill, 13px bold) | newer ›. An arrow fades to 0.3 opacity at either end of the range. The centre pill opens the Time Machine.

### 2. Time Machine picker — `screenshots/site-09-time-machine-picker.png`
- A dropdown panel anchored top-right, 600px wide, radius 26, background `linear-gradient(170deg,#1a2070,#0f1548)`, border `rgba(255,63,180,.45)`, pink glow. The backdrop dims and blurs the page.
- Title "Time machine" (script font, 26px, gold) with the subline "Every contest since Lugano 1956".
- Rows by decade, newest first: decade label (Unbounded 700 12px, `#ff8fd6`) plus 50px-wide year chips. Each chip's style shows its state:
  - **Full results:** gold tint.
  - **Winner only:** faint outline.
  - **Selected:** pink→purple gradient.
  - **2020:** dimmed, because it was cancelled.
- Each chip's tooltip reads "{City} {Year} · won by {Country}". Esc or clicking the backdrop closes the panel.
- In production, each chip is a link to `/{year}/`.

### 3. Hero — `site-01-hero-countdown.png`
- Centred column with no top padding. A logo image (`assets/eurofizzion-logo.jpg`) is blended into the page with `mix-blend-mode: lighten` and an elliptical mask fade (`radial-gradient(ellipse 72% 78% at 50% 48%, #000 62%, transparent 100%)`). Size: `height: min(52vh, 520px)`, min 260px, max-width 100%.
- About 60 twinkling 4-point star sparkles (clip-path star, sizes 6–20px; colours gold, pink, cyan, white, purple and orange; `twinkle` keyframe over 2.2–5.2s with random delay).
- Script line "The countdown to Burgas is on", 24px gold with a glow.
- **Countdown:** four tiles (days, hours, minutes, seconds), each min-width 96px, radius 20, background `linear-gradient(160deg, rgba(255,63,180,.22), rgba(63,125,255,.14))`, 1px `rgba(255,255,255,.14)` border. Number: Unbounded 700 40px, tabular. Label: 11px bold, 0.16em letter-spacing, uppercase, `#c8c2ff`. Ticks every second towards `2027-05-15T21:00:00+02:00`.
- **CTAs:** "Watch every entry" (gold gradient `#ffd23f→#ff9f2e`, text `#1a0b33`) and "Replay the vote" (pink→purple, white text). Both are 13×24 padding pills, 700 15px, with a coloured shadow.

### 4. Flag parade — `site-02-flag-parade-winner-bar.png`
- A full-bleed strip with 14px vertical padding and a pink→blue→cyan tint at 16% alpha. Its marquee scrolls every participating country (each a 30px flag in a rainbow ring plus the name in Unbounded 700 12px uppercase) over 90s linearly, with the edges masked to fade.
- **Rainbow ring** (used everywhere a flag appears): `conic-gradient(#ff3fb4,#9b5cff,#3f7dff,#2de2f5,#ffd23f,#ff3fb4)` with 2px padding, and the flag inside a 2px `#0f1548` border.

### 5. Winner spotlight — `site-02-flag-parade-winner-bar.png`
- A card with radius 32, padding 32, background `linear-gradient(120deg, rgba(255,210,63,.16), rgba(255,63,180,.14) 45%, rgba(63,125,255,.14))`, 1px gold border at 35% and a soft gold glow. It is a two-column auto-fit grid (min 420px).
- **Left:** a 120px flag in a rainbow ring with a `floaty` 5s bob. The badge "★ Winner · {City Year}" is a gold pill. Artist: Unbounded 800 `clamp(36px,5vw,64px)`. Song: script font 34px gold with a glow, 12px margin-top. Country: 13px bold, 0.14em, uppercase, `#ff8fd6`.
- **Right:** stat tiles (points in gold, jury in `#ff6fc8`, televote in `#4fe8f7`, and "+margin vs {runner-up}"), each Unbounded 700 28px on `rgba(9,13,53,.55)` with radius 18. Below them the note copy (15px) and a "▶ Watch the winning performance" pill.
- **Winner-only years** (`site-10-winner-only-year-1974.png`): no stats and no watch button, just the flag, badge, artist, song and country.

### 6. Entries grid — `site-03-entries-grid.png`
- Section header: script kicker "The entries" (26px gold with glow). H2 "{City Year}" in Unbounded 800 `clamp(32px,4.4vw,52px)`. Subline: "{n} songs · {n} in the Grand Final · {date} · {venue}".
- **Filter pills** (right): "All 35", "Grand final 25", "Out in the semis 10". The active one has the pink→purple gradient; inactive ones have a 1px `rgba(255,255,255,.16)` outline. These are hidden when a year has no semi-final data.
- **Grid:** `repeat(auto-fill, minmax(250px,1fr))`, gap 22px × 16px. Finalists come first, in order of placing, then non-qualifiers.
- **Card:** radius 24, background `linear-gradient(180deg, rgba(40,48,140,.55), rgba(20,26,90,.55))`, 1px `rgba(255,255,255,.09)`. On hover it lifts by 6px, the border turns pink at 70% and it gains a pink glow (.25s).
  - **Thumbnail:** inset 8px, 16:9, radius 18, with clipping forced for Safari (`-webkit-mask-image` + `translateZ(0)`).
    - Layer 1: the country flag, blurred 18px, saturate 1.6, opacity .85. This creates the coloured **flag rim**.
    - Layer 2: the YouTube still, inset 5px, radius 14, `background-size: 118% auto` so the official thumbnails' built-in border frame is cropped away.
    - Layer 3: a bottom gradient towards `rgba(9,13,53,.92)`.
  - **Overlays:**
    - Top-left: running-order chip "Nº 12", or "Auto-qualified", "Semi 1" or "Semi 2".
    - Top-right: placing badge — "★ Winner" (gold), 2nd–10th (pink gradient), 11th and below (blue), "Semi-finalist" (dark).
    - Centre: a 56px pink→purple play button with a halo.
    - Bottom-left: the flag in a rainbow ring plus the country (Unbounded 700 13px uppercase).
    - Bottom-right: a cyan chip "▶ Live", "▶ Music video" or "▶ Live · MV", shown only when a video exists.
  - **Body:** artist (700 18px), song in quotes (15px gold), meta line (12px `#a9a3e0`) — either "516 pts · 204 jury · 312 televote" or "Semi-final 1 · 11th with 79 pts".

### 7. Video modal (not captured — fixed overlays don't screenshot; open the prototype to see it)
- The backdrop is `rgba(6,8,36,.86)` with a 12px blur. The panel is `min(940px,100%)` wide, radius 28, with a `#1a2070→#0f1548` gradient, pink border at 45% and a pink glow.
- **Player:** inset 10px, 16:9, radius 20, with a close button top-right (40px circle).
- **Tabs:** "Live performance" | "Official music video". Each tab has a status dot: cyan glow if that video exists, grey if not. The live tab is the default when a live video exists.
- **Empty state:** a blurred flag background, the script heading "Lights, camera…", the line "No live performance linked yet" and a "Find it on YouTube ↗" link. The search query is "{country} {artist} {song} Eurovision {year} live" or "… official music video".
- **Info:** the flag in a ring with "{COUNTRY} · {City Year}" and the placing badge, the artist (Unbounded 800 32px), the song (script 22px gold), and three stat tiles with a jury/televote split bar.
- Esc or a backdrop click closes the modal.

### 8. Scoreboard — `site-04-scoreboard.png`, `site-05-vote-reveal-in-progress.png`, `site-06-scoreboard-highlights.png`
- Kicker "And the points go to…". H2 "Scoreboard · {City Year}". Legend: jury = pink→purple swatch, televote = blue→cyan swatch.
- **Controls:** "By total", "By jury" and "By televote" pills, plus the gold CTA "▶ Play the vote reveal".
- **Phase banner:** a pill tag plus a sentence. The states are:
  - "Final results"
  - "Juries" — "The juries have spoken…"
  - "Televote 7/25" — "Serbia receives 52 points from the public!"
  - "★ Winner"
- **Rows:** absolutely positioned at `top = rank × 56px`, 50px tall, radius 16. The grid is 44px rank | country (flag in ring, name, artist · song) | stacked bar (jury segment then televote segment, scaled to the winner's total) with "J 204 T 312" beneath | 84px score box. The leader gets a gold score box and a gold-tinted row. The row being revealed gets a pink border and glow, plus "+52 from the public!" in gold.
- **Animation:** rows move with `transition: top .8s cubic-bezier(.34,1.3,.5,1)` (overshoot), and bars with `width .8s cubic-bezier(.2,.8,.2,1)`.
- **Vote reveal logic:**
  1. Start with jury points only.
  2. Every `revealSpeed` ms (default 900), add the televote for the next country, going from the lowest jury score upwards. This is a simplification of the real show order.
  3. Re-rank after each reveal.
  4. When all are added, show the "★ Winner" banner.
  - During the reveal the CTA reads "Skip to the result"; afterwards it reads "↺ Back to full results".
- **Years with no split (pre-2016):** show the total only, with gold bars. Hide the legend, the sort pills, the reveal button and the highlight cards. The phase text adds: "Jury and televote scores were only published separately from 2016."
- **Highlight cards** (three, auto-fit at min 260px): Jury favourite (`#ff6fc8`), Televote favourite (`#4fe8f7`), Biggest jury vs public split (gold).

### 9. Odds vs result — `site-07-odds-vs-result.png`
- Kicker "The bookies' crystal ball". H2 "Did the odds get it right?". A generated insight sentence, e.g. "Finland went in as the bookies' favourite at 1/1 and finished 6th. Bulgaria won from 7th in the betting (35/1)."
- **Rows** (sorted by betting rank): country | odds (gold) | track from 1st to last with an outlined dot for the betting position and a solid dot for the final placing, joined by a segment | movement ("▲ 6 up" in cyan, "▼ 5 down" in pink, "Spot on" in gold). Segment colours: cyan→blue when the entry beat its odds, pink→purple when it underperformed.
- The section appears only when there are at least 2 rows with odds.

### 10. Next contest — `site-08-next-contest.png`
- Full-bleed with pink and cyan radial glows and sparkles. Kicker "Next stop, the Black Sea". H1 "Burgas 2027" in Unbounded 800 `clamp(56px,10vw,144px)` with a pink→purple→blue→cyan gradient fill.
- Three show cards (Semi-final 1, Semi-final 2, Grand Final), with pink, cyan and gold accents respectively.
- A participation card: "33 broadcasters have provisionally confirmed for 2027", followed by chips for Debut (gold), Returning (pink) and Not returning (grey).
- Content comes from `upcoming.json`.

### 11. Footer
- The wordmark, the domains, a small "CMS" link (remove it in production), and the disclaimer: "An unofficial fan site, not affiliated with the EBU or the Eurovision Song Contest…"

### Empty states
- **Winner-only year:** script heading "Results coming soon" with the copy "The full line-up and scoreboard for {City Year} haven't been added yet." The CMS link should not appear on the public site.
- **2020:** "No contest this year" — cancelled because of COVID-19; the spotlight mentions *Europe Shine a Light*.

---

## Screens — CMS

### Layout — `screenshots/cms-01-results-bundled-year.png`
- **Header** (60px, sticky): wordmark, a cyan "CMS" pill, a status line ("Saved in this browser · N contests with CMS data") and a "View site ↗" pill.
- **Left sidebar** (190–240px, sticky, scrolls independently): every year grouped by decade. Each row shows the year, the city and a status dot — gold = bundled or published, cyan = imported (draft), grey = winner only.
- **Main area:** a flag in a rainbow ring, a status kicker, an H1 "{City Year}", the subline "Won by …", and the tabs **Results | Videos | Publish**.

### Results tab — `cms-02-results-import-year.png`
- Buttons: "Import from Wikipedia" (gold), "Save to site" and "Discard preview" (only while a preview is open), "Remove imported results", and "Open on Wikipedia ↗". A message line uses cyan for success and pink for errors.
- **Preview table:** Pl. | Country | Artist | Song | Jury | Tele | Total | Stage. While unsaved, the table has a gold border.
- **Parser rules** (see `parseWiki()` in the CMS file; this moves to the `wiki-import` function):
  - Walk the `h2`–`h4` headings and `table.wikitable` elements in document order, classifying each table by its nearest heading: "Final", "Semi-final 1/2", or skip anything about qualification or national selection.
  - A **results table** is one whose header row contains Country, Song and either Points or Place. Map the columns by header text and the country names to codes via `countries.json` plus aliases (Czech Republic, (FYR) Macedonia, West Germany, Türkiye…).
  - **Split table:** any final-section table whose header mentions both "jury" and "televot". For each country row, take three numbers; the one equal to the sum of the other two is the total, and the column order decides which remaining number is jury and which is televote.
  - If there is no Place column, rank by points.
  - Finalists absent from every semi-final table get status `A`. Semi entries not in the final become non-qualifiers with their semi placing and points.
  - Always show the preview; never auto-save.

### Videos tab — `cms-03-videos.png`
- Controls: a "YouTube Data API key" password input (moves to a server environment variable in production), a checkbox "Only search the official Eurovision Song Contest channel", "Find videos for all N entries" with a progress line and a Stop button, and the counters "12/35 live · 8/35 music videos".
- **Per entry:**
  - The flag, country, artist and song.
  - Two slots (Live performance, Music video). Each slot shows a 96px thumbnail, its title, and Search ↗, Watch and Clear actions.
  - A paste field with "→ Live" and "→ Music video" buttons.
  - A "Find on YouTube" button.
  - A candidate grid of the top 8 results. Each candidate shows a kind badge (Live / Music video / Other), a "% match" figure, the channel, and "Use as live" / "Use as MV" buttons.
- **Matching logic:**
  - Query: "{artist} {song} Eurovision {year}", embeddable videos only.
  - Match score = 0.6 × the share of song tokens found in the title + 0.4 × the share of artist tokens (both normalised and diacritic-stripped).
  - Kind: titles containing rehearsal, reaction, cover, karaoke, lyric, instrumental, preview, recap, snippet, interview or press count as **other**. "official (music) video", "music video" or "videoclip" count as **mv**. "live", "grand final" or "semi final" count as **live**. Before 2000, uncategorised results count as live.
  - Auto-fill only **empty** slots, and only with the best candidate of the right kind at ≥ 50% match.

### Publish tab — `cms-04-publish.png`
- In the prototype: "Download eurofizzion-cms.json", "Copy JSON", and a read-only JSON preview.
- **In production:**
  - Replace the download with a **"Publish changes"** button that commits via the `publish` function.
  - Show a diff summary first ("2025: 37 entries imported · 2026: 14 videos linked").
  - After publishing, show the commit SHA and a "Netlify build started" link to the deploy log.
  - Clear the drafts on success.

---

## Interactions summary
- **Year navigation:** ‹ › step through every archive year. In production these and the picker chips are links to `/{year}/`; reset the filter and reveal state on navigation.
- **Countdown:** a 1s interval, computed on the client from `finalISO`.
- **Esc** closes the modal or the picker.
- **Focus:** `:focus-visible` shows a 2px `#2de2f5` outline with 3px offset.
- **Responsive:** every grid uses `auto-fit`/`auto-fill` with `minmax`; the header wraps. Verify mobile below 600px — the scoreboard's 4-column row needs a stacked variant, which the prototype doesn't have yet.
- **Reduced motion:** disable twinkle, marquee and floaty, and make the reveal transitions instant when `prefers-reduced-motion` is set.

## Design tokens
| Token | Value |
|---|---|
| Background | `#090d35` |
| Surface deep | `#0f1548` |
| Surface gradient | `#1a2070 → #0f1548` |
| Card fill | `rgba(40,48,140,.55) → rgba(20,26,90,.55)` |
| Text | `#f7f4ff`; secondary `#e8e4ff`; muted `#c8c2ff`; faint `#a9a3e0` |
| Pink | `#ff3fb4` (light `#ff6fc8`, text `#ff8fd6`) |
| Purple | `#9b5cff` / `#b04dff` |
| Blue | `#3f7dff` |
| Cyan | `#2de2f5` (text `#4fe8f7`) |
| Gold | `#ffd23f` (light `#ffe066`), orange `#ff9f2e` |
| Dark text on gold | `#1a0b33` |
| Primary gradient | `linear-gradient(90deg,#ff3fb4,#9b5cff)` |
| Gold gradient | `linear-gradient(90deg,#ffd23f,#ff9f2e)` |
| Jury bar | `#ff3fb4 → #b04dff` |
| Televote bar | `#3f7dff → #2de2f5` |
| Rainbow ring | `conic-gradient(#ff3fb4,#9b5cff,#3f7dff,#2de2f5,#ffd23f,#ff3fb4)` |
| Radii | 999 (pills), 32 (spotlight), 28 (modal), 26 (panels), 24 (cards), 20 (thumb in modal, tiles), 18 (card thumb), 16 (rows), 14, 12, 10 |
| Borders | `rgba(255,255,255,.07–.16)`; accent borders at 35–55% alpha |

**Type**
- **Unbounded** 500/700/800 — display: H1/H2 800, numbers 700, artist names 800.
- **DM Sans** 400/500/700 — body and UI (body 15px, meta 12–13px, labels 11–12px bold uppercase with 0.12–0.16em tracking).
- **Kaushan Script** — the gold script accents (section kickers 26–28px, song titles in the spotlight and modal). Chosen by the owner; the prototype keeps alternatives in Tweaks but production needs only Kaushan.
- **Pacifico** — only for "fizzion" in the wordmark.

**Keyframes**
- `twinkle`: opacity .1 → 1 → .1 with scale .5 → 1 and rotate 0 → 45°.
- `marquee`: translateX(0 → -50%) on a duplicated list.
- `floaty`: translateY(0 → -10px → 0).

## Assets
- `design/assets/eurofizzion-logo.jpg` — the owner's generated logo, used in the hero with lighten blend and mask.
- **Flags:** flagcdn.com in the prototype; switch to self-hosted SVGs. Custom flags are needed for Yugoslavia (`yu`) and Serbia & Montenegro (`cs`).
- Icons are inline Phosphor-style SVG paths (play, close, carets).
- **Trademark:** do not use the official Eurovision heart logo or wordmark. Keep the "unofficial fan site" disclaimer.

## Files
- `design/Eurofizzion v2.dc.html` — the public site prototype. Its `renderVals()` logic holds every derived calculation.
- `design/Eurofizzion CMS.dc.html` — the CMS prototype, containing `parseWiki()`, `search()` and the YouTube matching.
- `design/esc-data.js` — the prototype data: countries, 4 full years, the archive from 1956 and the upcoming contest.
- `design/support.js` — the runtime needed to open the `.dc.html` files locally. Not part of production.
- `screenshots/` — the site and CMS captures referenced above.
