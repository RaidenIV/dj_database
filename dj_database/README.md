# DJ Database (MongoDB + Railway)

This project adds a backend (Express + MongoDB) for the DJ Profile Database UI, with CSV import/export.

## Local dev (server)
```bash
cd server
npm install
cp .env.example .env
# set MONGODB_URI and optionally DB_NAME + ADMIN_TOKEN
npm run dev
```

Server health:
- `GET http://localhost:3000/health`

API:
- `GET /api/djs` (admin)
- `POST /api/djs` (admin, or public if PUBLIC_SUBMISSIONS=true)
- `PUT /api/djs/:id` (admin)
- `DELETE /api/djs/:id` (admin)
- `GET /api/djs/export.csv` (admin)
- `POST /api/djs/import` (admin) multipart/form-data field name: `file`

## Client
Open `client/index.html` in a browser, set:
- API Base URL = your Railway URL (or http://localhost:3000)
- Admin Token = same as ADMIN_TOKEN

Then click "Save / Connect".
