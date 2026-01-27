# DJ Database Repo Layout (GitHub-ready)

```
dj_database/
├── .gitignore
├── DEPLOY_CHECKLIST.md
├── RAILWAY_NOTES.md
├── README.md
│
├── client/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
│
└── server/
    ├── .env.example
    ├── package.json
    ├── server.js
    ├── middleware/
    │   └── requireAdmin.js
    ├── models/
    │   └── DJProfile.js
    ├── routes/
    │   └── djs.js
    └── utils/
        └── csv.js
```

## What goes where
- `client/` is what you host in GitHub Pages (or embed in Squarespace)
- `server/` is what you deploy to Railway (Express + MongoDB API)
