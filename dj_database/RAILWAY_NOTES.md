# Railway Start Config Notes (Node + Express)

## Recommended project layout on Railway
This repo contains:
- `client/` (static front-end)
- `server/` (Express API)

For Railway you typically deploy **only the `server/` directory** as the service root.

### Option A: Set Root Directory (recommended)
In Railway service settings:
- Root Directory: `server`

Then Railway will run:
- `npm install`
- `npm start`

### Option B: Monorepo without changing Root Directory
If you keep root at repo top-level, you must:
- Set Build Command: `cd server && npm install`
- Set Start Command: `cd server && npm start`

## Port binding (required)
Railway injects a `PORT` variable. Your server must listen on:
- `process.env.PORT`

This repo does so in `server/server.js`.

## Environment variables
Set these in Railway → Variables:
- `MONGODB_URI` (required)
- `DB_NAME` (recommended)
- `ALLOWED_ORIGINS` (recommended)
- `ADMIN_TOKEN` (recommended)

## Health check
A quick confirmation endpoint exists:
- `GET /health` returns `{ ok: true }`

## CORS
The server restricts origins using `ALLOWED_ORIGINS`.
If you embed via Squarespace, include your Squarespace domain(s) there.

## Admin auth
If `ADMIN_TOKEN` is set:
- Requests must include either:
  - `Authorization: Bearer <token>` OR
  - `X-Admin-Token: <token>`

If you do NOT set `ADMIN_TOKEN`, the API will allow requests without auth (not recommended).
