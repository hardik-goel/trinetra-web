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

## Watchlist groups, filter and sort

Above the watchlist sits a group selector — **All · Default · …** with counts.
Groups come from the backend's `/watchlists`; the engine scans the **union** of
every group, so a symbol in two lists is still watched once. Groups slice the
view, they never widen what is scanned. Each row carries small group tags, read
from the `groups` field the backend attaches to every snapshot row.

Manage the lists in the **Universe** panel: create, rename and delete watchlists,
tap symbol chips to multi-select, then **Move to…** a target list. The last
remaining list cannot be deleted — the backend refuses, so "where do symbols go?"
always has an answer.

Sort by criteria met (default), symbol, price, day change, volume multiple, or any
fundamental metric the backend sends, ascending or descending. Missing values sort
last in **both** directions, because absent is not a low value. Filter by group,
minimum criteria met, sector, and a "signal today" toggle; filters compose, active
ones show as chips, and one tap clears them. Sort and filter live in component
state — they are how you are looking right now, not a saved preference.

## Track Record — is this worth paying for?

The **Track Record** chip opens the validation module. It exists to answer one
question before you spend ₹2,000/month on Kite, and it is built to be capable of
answering *no*. It needs the live backend: signals, trades and applications are
recorded server-side so they accrue while the tab is closed. Demo mode says so
rather than inventing a history.

A range control drives every view — 7 / 30 / 90 days, or **Custom** with a
calendar where both ends are selectable (future dates are not).

- **Signals** — every signal fired in the range with the price at fire, which
  criteria locked, forward returns at 1/3/7/30 days, and the max gain and max
  drawdown along the way. Two breakdowns turn it into a lesson: by criteria
  combination (does 3/3 actually beat 2/3?) and per criterion (how signals *with*
  it did against those *without*). Each row offers **"Did you take this?"**, which
  opens the trade logger prefilled and links the trade to the signal.
- **Paper Trades** — log entry date, price, quantity, optional stop and target,
  and a free-text thesis. Close with an exit date, price and reason. Open
  positions mark to market; closed ones show realised P&L. The stats panel gives
  win rate, average win and loss, expectancy, profit factor, largest win and loss.
- **IPOs** — what Pravesh suggested in the range with the verdict it gave then,
  a **"Did you apply?"** logger, allotment tracking and listing gain. Requires
  `PRAVESH_DATA_URL` on the *backend* for the "engine said apply, you skipped"
  figure; without it the tile prints the reason instead of a number.
- **Verdict** — the summary the module exists for, below.

### How to use it for a genuine go/no-go on Kite

1. **Run it for months, not weeks.** Forward returns need 30 days to mature, and
   the module refuses to print a percentage below **20 closed trades**, **15
   resolved IPOs** or **20 matured signals** per horizon — it says
   `insufficient sample (n=6)` instead. That is the honest answer, not a gap.
2. **Log every decision, including the ones you skip.** The comparison that
   matters is *your picks vs taking every signal*: a negative `edgePct` means the
   raw screener beat your selection of it, and the useful response is to take more
   of its signals, not fewer. That number only exists if you record what you did.
3. **Read the Verdict tab last.** It states plainly whether the sample supports a
   conclusion, what the numbers suggest with their n, and the cost line: what the
   paper book returned over the window against the ₹2,000/month prorated to it.
4. **Discount the result before you trust it.** Paper trading excludes slippage,
   brokerage, STT and the psychology of real money; live results are typically
   worse. Kite also buys live ticks and real order-flow depth this screener cannot
   price — the cost line compares a paper P&L to a fee, nothing more.

> Track record records live in the backend's `data/` directory. On Render's free
> tier a redeploy wipes them, which makes a months-long measurement impossible —
> attach a persistent disk mounted at `data/` before you start counting on it.

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
