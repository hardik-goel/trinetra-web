# Trinetra · Web

The Trinetra dashboard as a deployable Next.js app. Hosts on Vercel free tier
and connects to your Trinetra backend automatically.

## Deploy to Vercel (~10 min, free)

1. Push this folder to a new GitHub repo (e.g. `trinetra-web`).
   Keep files at the repo root — `app/`, `components/`, `package.json` at top level.
2. Go to vercel.com → **Add New… → Project** → import the repo.
3. Vercel auto-detects Next.js. Before deploying, open **Environment Variables**
   and add ONE:
   - Name:  `NEXT_PUBLIC_BACKEND_URL`
   - Value: `https://trinetra-backend-tukc.onrender.com`   (your backend URL, no trailing slash)
4. Click **Deploy**. In ~1–2 min you get a real URL like `trinetra-web.vercel.app`.

That's it. The app opens like any website — on your phone or laptop — and
**auto-connects to your backend on load** (no pasting URLs). Add the site to
your phone's home screen for an app-like icon.

## Oracle: parked

The AI Forecast criterion is **paused**. The forecast service reads free price
feeds that answer HTTP 429 to Render's IP, so it returns nothing — and a criterion
with no data can never pass, while the eye opens only when every *enabled*
criterion does. Left switchable, one click would silence every signal in the app.

So the tab, the explainer and the threshold control all stay; only the switch is
inert. `ORACLE_ENABLED` at the top of `components/Trinetra.jsx` is the whole gate:
flip it to `true` once a keyed feed (Kite) is wired and the toggle, the status
tiles and the criterion come back with no other edit. Deploying the Oracle service
alone will not un-pause it — the blocked link is the price feed it reads.

## Fundamentals tab

The **Fundamentals** chip in the action strip opens the whole scraped matrix:
one row per watchlist symbol, one column per metric, plus a provenance column
(`fetched` / `partial` / `seed` / `none`, or `demo`). Cells are judged against
the Fundamentals criterion — green passes, red fails, grey means no threshold is
set on that metric, dim means the scrape could not establish the value. Click any
column header to sort; missing values always sort last, because absent is not low.

Underneath is **Build a fundamental filter**: pick a metric, `≥` or `≤`, a value,
and it becomes a check on the Fundamentals criterion — the same gate the eye opens
on, editable from the Criteria panel and pushed to the backend by **Sync criteria
to backend**. That is how you add your own `Piotroski ≥ 7` or `ROCE ≥ 20%` rules.
**Refresh all fundamentals** posts to `/fundamentals/refresh-all`; it is paced at
roughly one symbol per second server-side, so a large universe takes a while.

In demo mode the matrix shows simulated values and the refresh/sync controls are
disabled — the numbers are not real company data and are labelled `demo`.

### New backend metrics appear here automatically

`trinetra-backend/fundamentals.config.js` is the single source of truth for which
metrics exist. Add an entry there and the backend scrapes it, includes it in
`GET /fundamentals`, and accepts it as a criteria check. On this side **no release
is needed**: the tab builds its columns from the keys actually present in the
payload, so a new metric shows up as a column (marked `＋`), sorts, gets a
threshold in the filter builder, and is selectable in the Criteria panel — with a
humanized label derived from the key and a `%` unit inferred when the name implies
one. Adding the key to `FUND_METRICS` in `components/Trinetra.jsx` is optional
polish: it supplies the proper name, unit and short column header.

The reverse also holds: a metric the backend stops sending simply stops appearing.

## Pravesh (IPO intelligence tab)

**Pravesh** is the doorway chip in the action strip, next to Criteria / Alerts /
Oracle / Universe. It opens in place — the screener keeps ticking behind it — and
shows three views: **Today** (open and upcoming IPOs, each with its full evidence
table and a separately-labelled My Take), **History** (past takes vs actual listing
gain), **Sources** (accuracy leaderboard, always with n). The same body is also
reachable as a full page at `/pravesh`.

It is **read-only**. All scraping, scoring and grading happen in the separate
`pravesh-engine` repo, which publishes a `data/latest.json` snapshot. This app only
fetches and renders it — nothing here can change a verdict or an accuracy.

### Pointing it at your engine

Optional. With nothing set, the tab reads the engine repo's committed snapshot at
`raw.githubusercontent.com/hardik-goel/pravesh-engine/{main,master}/data/latest.json`.

To use your own fork, mirror or CDN copy, add one environment variable on Vercel
(**Project → Settings → Environment Variables**, or `vercel env add`):

- Name: `NEXT_PUBLIC_PRAVESH_DATA_URL`
- Value: the raw URL of the engine's `data/latest.json`
  (e.g. `https://raw.githubusercontent.com/<you>/pravesh-engine/master/data/latest.json`)
- Environments: Production, Preview, Development

Then **redeploy** — `NEXT_PUBLIC_*` values are inlined at build time, so changing the
variable alone does not change a running deployment. The host you point at must send
CORS headers (`Access-Control-Allow-Origin`); raw.githubusercontent.com does.

Supabase works too, as an alternative to the JSON file: set
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and optionally
`NEXT_PUBLIC_PRAVESH_LATEST_TABLE`, default `pravesh_latest`). If both are present,
Supabase wins and the JSON URL is ignored.

If the URL is wrong, the engine has not run yet, or the fetch fails, the tab shows a
"Pravesh not connected yet" panel naming the URL it tried. The screener, the feed,
criteria, alerts and Oracle are unaffected — Pravesh cannot take the app down.

## Local run (optional)
```
npm install
cp .env.example .env.local   # edit the URL inside
npm run dev                  # http://localhost:3000
```

## Notes
- The backend URL is baked in at build time via NEXT_PUBLIC_BACKEND_URL.
  Change it → redeploy (Vercel does this automatically on git push).
- You can still switch to Demo or paste a different URL from the feed panel.
- Telegram alerts are sent server-side by the backend, so they fire even when
  this site isn't open. This app is your control panel + live view.
