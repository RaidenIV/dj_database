require("dotenv").config();

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
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

// Serve the frontend (same-origin)
const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir));

// API
app.use("/api/djs", djsRouter);

// Health
app.get("/health", (_req, res) => {
  const mongoState = mongoose.connection?.readyState ?? 0;
  res.json({ ok: true, mongoState });
});

// Root -> serve the app (avoid 404 on "/")
app.get("/", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
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

  try {
    const DJProfile = require("./models/DJProfile");
    await DJProfile.syncIndexes();
  } catch (e) {
    console.warn("Index sync failed (continuing):", e?.message || e);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`DJ Database (UI+API) listening on :${port}`));
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
