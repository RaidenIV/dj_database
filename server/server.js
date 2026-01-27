require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const djsRouter = require("./routes/djs");

const app = express();

app.set("trust proxy", 1);

/**
 * Helmet defaults include a strict Content-Security-Policy (CSP) and frame protections.
 * Your UI loads external resources:
 * - scripts: cdnjs (PapaParse, Chart.js)
 * - fonts: fonts.googleapis.com + fonts.gstatic.com
 * - logo: images.squarespace-cdn.com
 *
 * So we explicitly allow those sources.
 * Also: disable frameguard so you can iframe this app into Squarespace if desired.
 */
app.use(
  helmet({
    // Allow embedding in Squarespace (otherwise SAMEORIGIN blocks iframes)
    frameguard: false,

    // COEP can break some third-party resources in iframes; disable for compatibility
    crossOriginEmbedderPolicy: false,

    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        // Allow your CDN scripts
        "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
        // Allow Google Fonts CSS
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // Allow Google Fonts font files
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        // Allow your Squarespace CDN logo
        "img-src": ["'self'", "data:", "https://images.squarespace-cdn.com"],
        // Your app calls same-origin API endpoints
        "connect-src": ["'self'"],
        // Allow your Squarespace site to embed this app (optional; keep if you iframe it)
        "frame-ancestors": [
          "'self'",
          "https://www.xodiamediagroup.com",
          "https://xodiamediagroup.com"
        ]
      }
    }
  })
);

app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

/**
 * Resolve the client directory robustly.
 * Works whether the process starts in:
 * - /app (repo root)
 * - /app/server (server subdir)
 */
function resolveClientDir() {
  const candidates = [
    path.join(__dirname, "..", "client"), // when __dirname = /app/server
    path.join(__dirname, "client"), // when __dirname = /app
    path.join(process.cwd(), "client") // fallback
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return candidates[0];
}

const clientDir = resolveClientDir();
const clientIndex = path.join(clientDir, "index.html");

// Serve the frontend (same-origin)
app.use(express.static(clientDir));

// Explicit mounts (avoid path edge cases)
app.use("/css", express.static(path.join(clientDir, "css")));
app.use("/js", express.static(path.join(clientDir, "js")));

// Optional: avoid noisy favicon 404s
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// API
app.use("/api/djs", djsRouter);

// Health
app.get("/health", (_req, res) => {
  const mongoState = mongoose.connection?.readyState ?? 0; // 0..3
  res.json({ ok: true, mongoState });
});

// Root -> serve the app
app.get("/", (_req, res) => {
  res.sendFile(clientIndex, (err) => {
    if (err) {
      console.error("Failed to send client index:", err);
      res
        .status(500)
        .send("Client UI not found in deployed artifact. Ensure /client is deployed with the service.");
    }
  });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URL || "").trim();

  if (!uri) {
    console.error("Missing Mongo connection string. Set MONGODB_URI (recommended) or MONGO_URL.");
    process.exit(1);
  }

  const dbName = (process.env.DB_NAME || "").trim() || undefined;
  await mongoose.connect(uri, { dbName });

  // Do not hard-crash if index sync fails
  try {
    const DJProfile = require("./models/DJProfile");
    await DJProfile.syncIndexes();
  } catch (e) {
    console.warn("Index sync failed (continuing):", e?.message || e);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`DJ Database (UI+API) listening on :${port}`);
    console.log(`Serving client from: ${clientDir}`);
  });
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
