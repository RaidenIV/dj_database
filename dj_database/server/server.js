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

function buildCorsOptions() {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowNullOrigin = String(process.env.ALLOW_NULL_ORIGIN || "false").toLowerCase() === "true";

  return {
    origin: function (origin, callback) {
      if (!origin) {
        if (allowNullOrigin || process.env.NODE_ENV !== "production") return callback(null, true);
        return callback(new Error("CORS: null origin not allowed"));
      }

      if (allowed.length === 0) return callback(null, true); // if not set, allow all (not recommended)
      if (allowed.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  };
}

app.use(cors(buildCorsOptions()));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/djs", djsRouter);

async function start() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("Missing MONGODB_URI");
    process.exit(1);
  }

  const dbName = (process.env.DB_NAME || "").trim() || undefined;

  await mongoose.connect(uri, { dbName });

  // Ensure indexes (including unique compound index)
  const DJProfile = require("./models/DJProfile");
  await DJProfile.syncIndexes();

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`DJ Database API listening on :${port}`));
}

start().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
