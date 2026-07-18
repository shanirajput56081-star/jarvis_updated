# Jarvis — Deployment Guide (Frontend on cPanel + Backend on Railway)

Your backend (`server.ts`) needs a persistent Node.js process + WebSocket
support for real-time voice with Gemini Live. Shared cPanel hosting only
runs PHP/Apache, so it can't run this backend. Vercel is serverless, so
it can't run this either. Both work fine for the **frontend** (static
files), just not the backend.

**Fix:** frontend stays on your cPanel domain. Backend goes to Railway
(free tier is enough to start). One GitHub repo, two deployments.

---

## Part 1 — Deploy the backend on Railway

1. Go to https://railway.app → sign in with GitHub.
2. New Project → Deploy from GitHub repo → pick your `jarvis` repo.
3. Railway auto-detects `railway.json` in this project (already configured):
   - Build command: `npm install && npm run build:backend`
   - Start command: `npm run start`
4. Go to your new service → **Variables** tab, add:
   ```
   GEMINI_API_KEY=your_actual_gemini_api_key
   NODE_ENV=production
   FRONTEND_URL=https://yourdomain.com
   ```
   (No trailing slash on FRONTEND_URL.)
5. Deploy. Once live, go to **Settings → Networking → Generate Domain**.
   You'll get something like:
   ```
   https://jarvis-backend-production.up.railway.app
   ```
6. Test it: open `https://jarvis-backend-production.up.railway.app/api/health`
   in a browser — should show `{"status":"healthy",...}`.

Your WebSocket URL is the same domain with `wss://` and `/live`:
```
wss://jarvis-backend-production.up.railway.app/live
```

---

## Part 2 — Build the frontend for cPanel

On your own machine (VS Code), inside the project folder:

1. Create a file named `.env.production` in the project root:
   ```
   VITE_BACKEND_WS_URL="wss://jarvis-backend-production.up.railway.app/live"
   ```
   (Use YOUR actual Railway domain from Part 1, step 5.)

2. Build:
   ```
   npm install
   npm run build:frontend
   ```
   This creates a `dist/` folder with `index.html` and `assets/`.

3. Upload to cPanel:
   - Open cPanel → File Manager → go to `public_html` (or a subfolder
     if you want it at a sub-path).
   - Upload everything INSIDE `dist/` (just `index.html` + `assets/`
     folder — do NOT upload `server.cjs`, that's backend-only).
   - Also upload the `.htaccess` file included in this delivery — it
     makes page refresh work correctly for the single-page app.

4. Visit `https://yourdomain.com` — Jarvis frontend loads and connects
   to your Railway backend over WebSocket.

---

## Re-deploying after future code changes

- **Backend changed?** Just `git push` — Railway auto-redeploys.
- **Frontend changed?** Run `npm run build:frontend` again locally,
  re-upload the new `dist/index.html` + `dist/assets/` to cPanel
  (overwrite old ones).

---

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Frontend loads, mic button does nothing / no voice | WebSocket not connecting | Check `.env.production` has the correct `wss://` Railway URL, rebuild, re-upload |
| Browser console: CORS error | `FRONTEND_URL` on Railway doesn't match your domain | Fix the env var on Railway, exact match, no trailing slash |
| Railway app crashes on boot | Missing `GEMINI_API_KEY` | Add it in Railway Variables tab |
| cPanel page 404s on refresh | Missing `.htaccess` | Upload the `.htaccess` from this delivery to same folder as `index.html` |
