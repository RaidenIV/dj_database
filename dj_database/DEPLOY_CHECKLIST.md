# Minimal Deploy Checklist (DJ Database)

## 1) Create GitHub repo
- Create a new repo (e.g., `dj_database`)
- Commit this directory structure:
  - `/client` (static frontend)
  - `/server` (Express API)

## 2) Deploy the server on Railway
1. In Railway: **New Project → Deploy from GitHub repo**
2. Select the repo
3. Set the service **Root Directory** to:
   - `server`
4. Railway should detect Node. If not, set:
   - Build command: `npm install`
   - Start command: `npm start`

## 3) Configure Railway Variables (required)
Set these in Railway → Variables:
- `MONGODB_URI` = your MongoDB connection string
- `DB_NAME` = `xmg_dj_database` (recommended)
- `ALLOWED_ORIGINS` = `https://www.xodiamediagroup.com,https://xodiamediagroup.com`
- `ADMIN_TOKEN` = long random string (recommended)

Optional:
- `PUBLIC_SUBMISSIONS` = `false` (default)
- `ALLOW_NULL_ORIGIN` = `false` (default)
- `NODE_ENV` = `production`

## 4) Verify server
- Open: `https://<your-railway-service>.up.railway.app/health`
- Expected: `{ "ok": true }`

## 5) Connect the client
In the app UI:
- API Base URL = `https://<your-railway-service>.up.railway.app`
- Admin Token = same value as `ADMIN_TOKEN`
- Click **Save / Connect**
- Create a profile, then refresh. Confirm it persists.

## 6) Squarespace embed
Option A (recommended): Host `/client` on GitHub Pages and embed the Pages URL in Squarespace (iframe or Code Block).
Option B: Paste `client/index.html` into a Code Block and adjust the CSS/JS paths accordingly.

## 7) CSV import/export
- Export: uses `/api/djs/export.csv`
- Import: uploads CSV to `/api/djs/import` (admin only)
