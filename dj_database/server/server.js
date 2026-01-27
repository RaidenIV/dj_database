// server/server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const djsRouter = require("./routes/djs");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
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
 * CORS notes:
 * - Browser requests include an Origin header.
 * - PowerShell/curl/server-to-server often DO NOT include Origin. Those should be allowed.
 * - Some contexts (file://, sandboxed iframes) send Origin: "null".
 *   If you need that, set ALLOW_NULL_ORIGIN=true.
 */
function buildCorsOptions() {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowNullOrigin = String(process.env.ALLOW_NULL_ORIGIN || "false").toLowerCase() === "true";
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  return {
    origin: function (origin, callback) {
      // No Origin header: allow (not a browser CORS scenario)
      if (!origin) return callback(null, true);

      // Origin: "null" (file://, sandboxed iframe)
      if (origin === "null") {
        if (allowNullOrigin || !isProd) return callback(null, true);
        return callback(null, false); // deny without throwing / without 500
      }

      // If no allowlist provided, allow all (not recommended, but avoids accidental lockout)
      if (allowed.length === 0) return callback(null, true);

      // Allow only exact matches from ALLOWED_ORIGINS
      return callback(null, allowed.includes(origin));
    },
    credentials: false
  };
}

app.use(cors(buildCorsOptions()));

app.get("/health", (_req, res) => {
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoState = mongoose.connection?.readyState ?? 0;
  res.json({ ok: true, mongoState });
});

app.use("/api/djs", djsRouter);

// Basic error handler so unexpected errors don't become opaque crashes
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  // Accept multiple env var names so Railway setups are less fragile
  const uri = (
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||       // Railway Mongo service variable
    process.env.MONGODB_URL ||     // optional fallback
    ""
  ).trim();

  if (!uri) {
    console.error("Missing Mongo connection string. Set MONGODB_URI (recommended) or MONGO_URL.");
    process.exit(1);
  }

  const dbName = (process.env.DB_NAME || "").trim() || undefined;

  await mongoose.connect(uri, { dbName });

  // Index creation can fail under certain Mongo conditions. Don't hard-crash the API.
  try {
    const DJProfile = require("./models/DJProfile");
    await DJProfile.syncIndexes();
  } catch (e) {
    console.warn("Index sync failed (continuing):", e?.message || e);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`DJ Database API listening on :${port}`));
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
