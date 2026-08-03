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

## The manual

The whole app is documented in one place, rendered twice from `lib/guide.js` so the
two cannot drift: the **? Help** chip in the action strip, and the standalone page at
**`/docs`** (shareable, works without the backend). Both carry a search box and jump
links, and cover navigation, the four profiles, the decision surface, the brief,
exits, the track record, installing, and the list of things the app refuses to do.

Edit `lib/guide.js` to change either.

## Backup and restore

Positions → **Capital & risk** → **Backup & restore**. `Download backup` pulls one
file holding holdings, signal history, paper trades, IPO applications, watchlists and
your tuned profiles; the backend excludes credentials from it. `Restore from file…`
asks for an explicit confirmation before overwriting, and the backend saves the current
state to `pre-restore.json` first.

Both routes require `BACKUP_TOKEN` (set it on Render; the backend fails closed with
503 if it is unset and 401 on a wrong one). Paste the same value into the token field
in the panel — it is stored **on your device only**. It deliberately does not come from
a `NEXT_PUBLIC_*` variable: those are inlined into the JavaScript bundle, so shipping
the token that way would publish it to anyone who opens the page, which is the exact
exposure the token exists to close.

> Do this **before every Render deploy**. Without a persistent disk mounted at `data/`,
> a redeploy wipes all of it — and you cannot back up through an endpoint that is not
> deployed yet.

## Install it (PWA)

Trinetra installs to a home screen from the browser — no store, no build step.

- **iPhone / iPad — you must use Safari.** Open the site in Safari, tap **Share**, then
  **Add to Home Screen**. *Chrome, Firefox and Edge on iOS cannot install it* — Apple
  restricts Add to Home Screen to Safari, so those browsers show a line telling you to
  switch rather than a button that would do nothing.
- **Android** — Chrome, Edge or Samsung Internet show an **Install** prompt; otherwise
  browser menu → **Install app**.
- **Desktop Chrome / Edge** — the install icon at the right of the address bar.

Once installed it opens standalone in the warm-black shell, with the notch, dynamic
island and home indicator cleared via `env(safe-area-inset-*)` and no white flash on
launch. Push notifications are **not** part of the installed app: iOS web push needs
16.4+, an installed PWA, a push service and VAPID keys, none of which exist here.
Telegram remains the alert channel that works with the app closed.

### Caching: the shell, never the market

The service worker (`public/sw.js`) caches the app shell and **nothing you could trade
on**. A cached price is a price from an unknown moment, which in a market dashboard is
worse than a blank space. The policy:

| request | behaviour |
|---|---|
| `/_next/static/*`, icons, fonts | cache-first |
| navigations | network-first, cached shell only if the network fails |
| **anything cross-origin** (backend API, Pravesh feed) | **never intercepted, never stored** |
| same-origin data paths (`/snapshot`, `/holdings`, …) | network-only |

Verified rather than assumed: with the backend wired, 19 API/Pravesh responses were
served straight from the network, **0** by the service worker, and the shell cache held
**0** data URLs. If you ever proxy the API onto this origin, the registration passes
`NEXT_PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_PRAVESH_DATA_URL` origins to the worker as
`?bypass=` so they stay excluded.

Offline, navigations fall back to `/offline`, which deliberately shows no numbers at all.

### Shipping a new version

Bump `CACHE_VERSION` at the top of `public/sw.js` whenever the shell changes. On
activate, every older `trinetra-shell-*` cache is deleted, and the app shows a
**"New version available · Reload"** toast rather than reloading under you mid-decision.
Tested: seeded `v0` + `v1` caches, shipped `v2`, tapped Reload — only `v2` survived.

> Running other projects on `localhost:3000`? A service worker from a previous project
> can white-screen this one, and vice versa. Unregister via DevTools → Application →
> Service Workers, or `(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister())`.

## Profiles, Brief and Positions

**Profiles.** The backend evaluates four horizons independently — Intraday, Swing,
Positional, Long term — and every snapshot row carries `profileResults` plus a flat
`profilesLocked`. The chips above the watchlist switch which horizon the lock meters
answer for; **All profiles** tags each row with the horizons it currently satisfies.

Intraday is **not** gated. It runs on the ~15-minute delayed feed, because if the
estimated remaining move exceeds what has already gone, the tail is still tradeable.
The honesty mechanism is a hard confidence cap — 55 for intraday on a delayed feed,
65 for anything else — carried in `confidence.caps` and rendered beside every score,
plus the `lagDisclosure` sentence on the card. `PROVIDER=kite` lifts the cap
automatically, with no code change. Greying the chip would hide a feature that works.

> Known gap: the Criteria panel still edits the legacy flat list, which the engine no
> longer reads (it reads `config.profiles`). The panel says so rather than letting an
> edit quietly do nothing. A per-profile editor is the next piece of work.

**Brief** (`☀ Brief`) is the landing view before 11:00 IST on weekdays, with
`Dashboard →` as a one-tap escape that does not fire again in the session. It renders
the server-assembled `/brief` in its given order — exit signals first, then new
signals by profile, then IPOs, then events, then concentration — and never composes it
locally. The data-health line (provider, delay, refresh age, missing symbols) sits at
the top so a stale brief is never read as a live one.

**Positions** (`◱ Positions`) leads with exit signals ordered by severity. Each card
renders its `reasoning` sentence in full with the numbers behind it, the evidence strip
(entry, now, trigger level, % from entry, days held), the suggested action and the note
that the call is yours. Actions are **Mark closed** and **Dismiss this rule** — one rule
for one holding, not the rule everywhere. Below sit open holdings with unrealised %,
days held, the profile that triggered entry, and which rules are armed with the closest
one's distance. Concentration bars, warnings and caveats follow, then capital and
risk-per-trade.

**One tap to hold.** Every watchlist row carries `+ I'm holding this`. It posts
`{ symbol }` and nothing else — entry price, levels and the criteria locked at that
moment are captured server-side, because "the reason you bought no longer holds" cannot
be detected later without a record of what that reason was. Quantity, stop and target
are optional and editable afterwards in Positions.

## Tables: one component, everywhere

Every tabular view — Fundamentals, Playbook, Track Record's signals, combinations,
per-criterion, paper trades and IPOs, and Pravesh's history and source leaderboard —
renders through `components/DataTable.jsx`. Sorting is written once, so it behaves the
same in all of them.

- Click any header to cycle ascending → descending → none.
- Filters per column type: numeric range, text contains, date range, multi-select for
  categories, tri-state for booleans. They compose, show as chips, and clear in one tap.
- **Nulls sort last in both directions** — "not established" is not a small number — and
  a numeric filter excludes unknowns rather than treating them as zero.
- **Potential and return columns sort on magnitude**, so a sell capturing a 5% fall ranks
  alongside a buy gaining 5% instead of sinking to the bottom of a "best potential" sort.
- `showing X of Y` is always visible. A filtered table that looks unfiltered is how
  someone concludes a stock disappeared.
- The first column pins on horizontal scroll, so the symbol stays in view on a phone.

Two small tables stay inline by choice: Pravesh's per-IPO evidence table and the
buy-vs-sell summary, both a handful of fixed rows inside a card where a filter bar would
be furniture around nothing.

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
