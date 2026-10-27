# Eurofizzion

An unofficial Eurovision Song Contest fan site (eurofizzion.com / eurofizzion.eu), with an editor-only CMS.

**The site is fully static.** Every page is pre-built HTML. A visitor never triggers a database query, a
function call or an API request. The CMS saves edits as drafts in your browser, and **Publish** commits them
all to GitHub in **one commit**. Netlify rebuilds the site once on that push, which takes about 5 seconds for
all 73 pages.

## What's where

| Path | What |
|---|---|
| `content/` | **All site content, as JSON.** `countries.json`, `archive.json` (every contest's city, host and winner), `upcoming.json` (next contest), `contests/{year}.json` (full results; only for imported years). |
| `src/pages/` | `/` (latest full contest), `/{year}/` for every archive year, `/admin/` (CMS). |
| `src/lib/derive.ts` | Every derived number (rankings, favourites, biggest split, odds insight…), computed at build time. |
| `src/lib/wiki.ts` | Wikipedia results parser used by the CMS import. |
| `src/scripts/site.ts` | The only JavaScript on public pages: countdown, time machine, filters, scoreboard and vote reveal, video modal. It reads data already in the page. |
| `src/components/cms/App.tsx` | The CMS (Preact). Loads only on `/admin/`. |
| `netlify/edge-functions/admin-auth.ts` | Password-protects `/admin/*`. |
| `netlify/functions/youtube-search.mts` | CMS only: YouTube search, so the API key stays on the server. |
| `netlify/functions/publish.mts` | CMS only: commits changed `content/contests/*.json` in one commit. |
| `scripts/copy-flags.mjs` | Copies self-hosted SVG flags from `flag-icons` into `public/flags/` before each build (plus custom Yugoslavia / Serbia & Montenegro flags). |

Fonts are self-hosted (Fontsource), flags are self-hosted, and the logo is converted to WebP at build time
(2.4 MB → 35–105 kB). The only third-party requests come from YouTube: thumbnails from `i.ytimg.com`, and the
`youtube-nocookie.com` player, which is only created when someone presses play.

## Develop

Requires Node 24 (see `.nvmrc`; Astro 7 needs ≥ 22.23).

```sh
npm install
npm run dev        # site at http://localhost:4321 (the CMS opens, but its functions need netlify dev)
npm test           # parser, derivations, CMS helpers, functions (mocked)
npm run check      # TypeScript
npm run build      # → dist/
```

To run the CMS with its functions locally, use `npx netlify dev` with a `.env` file holding the variables below.

## Deploy on Netlify

1. **Add new site → Import from Git**, then pick this repo. `netlify.toml` already sets the build command (`npm run build`), the publish dir (`dist`) and Node 24.
2. **Site configuration → Environment variables**, add:

   | Variable | Value |
   |---|---|
   | `CMS_PASSWORD` | Password for `/admin/`. Without it, the CMS refuses every request. |
   | `GITHUB_TOKEN` | A **fine-grained** GitHub token with access to **this repo only**, permission **Contents: Read and write**. |
   | `GITHUB_REPO` | `owner/repo`, e.g. `nijemeis/eurofizzion` |
   | `GITHUB_BRANCH` | Optional; defaults to `main`. Must be the branch Netlify deploys. |
   | `CONTENT_DIR` | Optional; defaults to `content`. Only change it if the site lives in a subfolder of the repo. |
   | `YOUTUBE_API_KEY` | A YouTube Data API v3 key (Google Cloud Console). Restrict it to the YouTube Data API. |

3. Add your domains (eurofizzion.com, eurofizzion.eu) under **Domain management**.
4. Open `https://eurofizzion.com/admin/`. The browser asks for a username and password: any username works, and the password is `CMS_PASSWORD`.

### Keeping Netlify usage (credits) low

- Visitors cost only static bandwidth. There are no functions or edge functions on public pages: the edge function only runs on `/admin/*`.
- **One publish = one build.** Make as many edits as you like; they stay drafts until you press Publish.
- `netlify.toml` has an `ignore` rule that skips the build when a push only changes files the site isn't built from (e.g. this README).
- Suggested Netlify settings: turn off **Deploy Previews** and **Branch deploys** if you don't use them (Site configuration → Build & deploy → Branches and deploy contexts). Each one is a build.
- YouTube quota: `search.list` costs 100 of the free 10,000 units a day, so about 100 lookups a day. "Find videos for all" skips entries that already have both videos and stops on a quota error.

## The CMS

- **Results → Import from Wikipedia** fetches `en.wikipedia.org/api/rest_v1/page/html/Eurovision_Song_Contest_{year}` straight from your browser (Wikipedia allows this, so it uses no Netlify function), parses it and shows a preview. **Save draft** keeps it. Re-importing a year keeps its linked videos and odds.
- **Videos** searches YouTube per entry via the function, auto-fills only empty slots with a confident match (50% or better), and shows the top 8 candidates. You can also paste a link.
- **Publish** shows a summary of your changes (e.g. "2025: 37 entries imported · 2026: 14 videos linked"), commits them in one commit, links to the commit and the Netlify deploy log, and clears the drafts.

Drafts live in `localStorage` in the browser you edited in. Publish from the same browser.

Things the CMS doesn't edit (yet): odds, venue/date/notes, `upcoming.json` and `archive.json`. Edit those JSON files directly in GitHub; that also triggers one build.

## Before launch: verify the data

The 2026 results and odds came from public sources. **The 2023–2025 scores and odds order, and the winner archive (1956–2022), were compiled from memory in the design prototype.** Re-import 2023, 2024 and 2025 from Wikipedia in the CMS, check them against the preview, and spot-check `archive.json`. The odds for 2023–2025 are only a betting *order* (`oddsRank`) with no prices; the page labels them as fan-compiled.

The official Eurovision YouTube channel ID used by "Only search the official channel" (`UCRpjHHu8ivVWs73uxHlWwFA`, in `netlify/functions/youtube-search.mts`) also came from the prototype. Check it once.

## Design

Rebuilt from the Claude Design handoff (`Eurofizzion v2` and `Eurofizzion CMS` prototypes). Differences from the prototype, all from the handoff notes:

- Real static routes per year (`/1974/`) instead of in-page state. The year arrows and Time Machine chips are links.
- Visitors can no longer paste their own YouTube links. Videos come only from the CMS, and "Find it on YouTube ↗" remains the fallback.
- The scoreboard has a stacked layout below 600px. `prefers-reduced-motion` turns off the sparkles, marquee, float and transitions.
- The footer has no CMS link, and the public site never links to the CMS.
- The CMS has no API-key field (the key is a server environment variable), and **Publish** replaces "Download JSON".
