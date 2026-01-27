# DJ Database (Single-Service Deployment: UI + API)

This version deploys like your budget app:
- One Railway service hosts **both** the frontend (`/client`) and backend (`/server`)
- Same-origin requests (no CORS setup needed)
- Public URL serves the UI at `/`
- API under `/api/djs`
- Health at `/health`

## Local run
From repo root:
```bash
npm run start
```

Or:
```bash
cd server
npm install
npm start
```

## Railway
- Deploy the repo normally.
- Ensure Railway uses `railway.toml` (Nixpacks) and runs:
  `cd server && npm install && npm start`

## Env vars (Railway → Node service → Variables)
Required:
- `MONGODB_URI` (recommended) OR `MONGO_URL` (Railway Mongo)

Optional:
- `DB_NAME` = `xmg_dj_database`

Recommended security:
- `ADMIN_TOKEN` = long random string
Optional:
- `PUBLIC_SUBMISSIONS` = `true` to allow POST /api/djs without token
