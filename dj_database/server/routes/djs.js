const express = require("express");
const multer = require("multer");
const DJProfile = require("../models/DJProfile");
const { toCsv, parseCsv } = require("../utils/csv");
const { requireAdmin, allowPublicCreate } = require("../middleware/requireAdmin");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function normalizeProfileInput(body) {
  const stageName = String(body.stageName || "").trim();
  const email = String(body.email || "").trim();

  return {
    stageName,
    fullName: String(body.fullName || "").trim(),
    city: String(body.city || "").trim(),
    state: String(body.state || "").trim(),
    phoneNumber: String(body.phoneNumber || "").trim(),
    experienceLevel: String(body.experienceLevel || "").trim(),
    age: String(body.age || "").trim(),
    email,
    socialMedia: String(body.socialMedia || "").trim(),
    heardAbout: String(body.heardAbout || "").trim(),
    stageNameLower: stageName.toLowerCase(),
    emailLower: email.toLowerCase()
  };
}

// List all profiles (admin)
router.get("/", requireAdmin, async (req, res) => {
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

// Create (admin by default; optionally public if PUBLIC_SUBMISSIONS=true)
router.post("/", allowPublicCreate, async (req, res) => {
  try {
    const data = normalizeProfileInput(req.body);

    if (!data.stageName || !data.fullName || !data.age || !data.email) {
      return res.status(400).json({ error: "Missing required fields: stageName, fullName, age, email" });
    }

    const created = await DJProfile.create(data);
    res.status(201).json(created.toJSON());
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "Duplicate profile (stageName + email)" });
    }
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// Update (admin)
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const data = normalizeProfileInput(req.body);

    if (!data.stageName || !data.fullName || !data.age || !data.email) {
      return res.status(400).json({ error: "Missing required fields: stageName, fullName, age, email" });
    }

    const updated = await DJProfile.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated.toJSON());
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "Duplicate profile (stageName + email)" });
    }
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Delete (admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  const deleted = await DJProfile.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Export CSV (admin)
router.get("/export.csv", requireAdmin, async (_req, res) => {
  const docs = await DJProfile.find({}).sort({ createdAt: -1 }).lean();
  const csv = toCsv(docs);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="dj-profiles-export.csv"');
  res.send(csv);
});

// Import CSV (admin) -> upsert by (stageNameLower,emailLower)
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
    } catch (e) {
      errors.push({ stageName: norm.stageName, email: norm.email, error: "Failed to upsert row" });
    }
  }

  res.json({ ok: true, upserted, updated, skipped, errors });
});

module.exports = router;
