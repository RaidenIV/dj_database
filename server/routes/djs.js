const express = require("express");
const multer = require("multer");
const DJProfile = require("../models/DJProfile");
const { parseCsv } = require("../utils/csv");
const { requireAdmin, allowPublicCreate } = require("../middleware/requireAdmin");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

const STATE_MAP = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

function normalizeState(state) {
  if (!state) return '';
  const trimmed = String(state).trim();
  const upper = trimmed.toUpperCase();
  
  // If it's an abbreviation, convert to full name
  if (STATE_MAP[upper]) return STATE_MAP[upper];
  
  // If it's already a full name, capitalize it properly
  const normalized = trimmed.toLowerCase();
  for (const fullName of Object.values(STATE_MAP)) {
    if (fullName.toLowerCase() === normalized) return fullName;
  }
  
  // Return as-is with first letter capitalized if not found
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeProfileInput(body) {
  const stageName = String(body.stageName || "").trim();
  const email = String(body.email || "").trim();
  const phoneDigits = normalizePhone(body.phoneNumber);

  return {
    stageName,
    fullName: String(body.fullName || "").trim(),
    city: String(body.city || "").trim(),
    state: normalizeState(body.state),
    phoneNumber: phoneDigits,
    experienceLevel: String(body.experienceLevel || "").trim(),
    age: String(body.age || "").trim(),
    email,
    socialMedia: String(body.socialMedia || "").trim(),
    heardAbout: String(body.heardAbout || "").trim(),
    stageNameLower: stageName.toLowerCase(),
    emailLower: email.toLowerCase()
  };
}

router.get("/", requireAdmin, async (_req, res) => {
  const docs = await DJProfile.find({}).sort({ createdAt: -1 }).lean({ virtuals: true });
  res.json(
    docs.map((d) => ({
      id: d.id || (d._id ? String(d._id) : undefined),
      stageName: d.stageName,
      fullName: d.fullName,
      city: d.city || "",
      state: d.state || "",
      phoneNumber: d.phoneNumber || "",
      experienceLevel: d.experienceLevel || "",
      age: d.age,
      email: d.email,
      socialMedia: d.socialMedia || "",
      heardAbout: d.heardAbout || "",
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    }))
  );
});

router.post("/", allowPublicCreate, async (req, res) => {
  try {
    const data = normalizeProfileInput(req.body);

    if (!data.stageName || !data.fullName || !data.age || !data.email) {
      return res.status(400).json({ error: "Missing required fields: stageName, fullName, age, email" });
    }

    const created = await DJProfile.create(data);
    res.status(201).json(created.toJSON());
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ error: "Duplicate profile (stageName + email)" });
    res.status(500).json({ error: "Failed to create profile" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const data = normalizeProfileInput(req.body);

    if (!data.stageName || !data.fullName || !data.age || !data.email) {
      return res.status(400).json({ error: "Missing required fields: stageName, fullName, age, email" });
    }

    const updated = await DJProfile.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated.toJSON());
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ error: "Duplicate profile (stageName + email)" });
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const deleted = await DJProfile.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.get("/export.csv", requireAdmin, async (_req, res) => {
  const docs = await DJProfile.find({}).sort({ createdAt: -1 }).lean();
  const csv = toCsv(docs);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="dj-profiles-export.csv"');
  res.send(csv);
});

router.post("/import", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: "No file uploaded (expected field name: file)" });
  }

  const parsed = parseCsv(req.file.buffer);
  if (!parsed.length) return res.status(400).json({ error: "No valid rows found in CSV" });

  let upserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of parsed) {
    const norm = normalizeProfileInput(row);

    if (!norm.stageName || !norm.fullName || !norm.age || !norm.email) {
      skipped++;
      continue;
    }

    try {
      const r = await DJProfile.updateOne(
        { stageNameLower: norm.stageNameLower, emailLower: norm.emailLower },
        { $set: norm },
        { upsert: true }
      );

      if (r.upsertedCount && r.upsertedCount > 0) upserted++;
      else if (r.modifiedCount && r.modifiedCount > 0) updated++;
      else updated++;
    } catch (_e) {
      errors.push({ stageName: norm.stageName, email: norm.email, error: "Failed to upsert row" });
    }
  }

  res.json({ ok: true, upserted, updated, skipped, errors });
});

module.exports = router;
