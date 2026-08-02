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
