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

// CSP + iframe support for Squarespace embedding and external libs.
app.use(
  helmet({
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https://images.squarespace-cdn.com"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'self'", "https://www.xodiamediagroup.com", "https://xodiamediagroup.com"]
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

function resolveClientDir() {
  const candidates = [
    path.join(__dirname, "..", "client"),
    path.join(__dirname, "client"),
    path.join(process.cwd(), "client")
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return candidates[0];
}

const clientDir = resolveClientDir();
const clientIndex = path.join(clientDir, "index.html");

// Serve UI
app.use(express.static(clientDir));
app.use("/css", express.static(path.join(clientDir, "css")));
app.use("/js", express.static(path.join(clientDir, "js")));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// API
app.use("/api/djs", djsRouter);

// Health
app.get("/health", (_req, res) => {
  const mongoState = mongoose.connection?.readyState ?? 0;
  res.json({ ok: true, mongoState });
});

// Root
app.get("/", (_req, res) => {
  res.sendFile(clientIndex);
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URL || "").trim();
  if (!uri) {
    console.error("Missing Mongo connection string. Set MONGODB_URI or MONGO_URL.");
    process.exit(1);
  }

  const dbName = (process.env.DB_NAME || "").trim() || undefined;
  await mongoose.connect(uri, { dbName });

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
