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
