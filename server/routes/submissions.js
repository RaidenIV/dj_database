const express = require("express");
const rateLimit = require("express-rate-limit");
const DJProfile = require("../models/DJProfile");
const DJSubmission = require("../models/DJSubmission");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

const publicSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." }
});

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

const STATE_MAP = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

function normalizeState(state) {
  if (!state) return "";
  const trimmed = String(state).trim();
  const upper = trimmed.toUpperCase();
  if (STATE_MAP[upper]) return STATE_MAP[upper];

  const normalized = trimmed.toLowerCase();
  for (const fullName of Object.values(STATE_MAP)) {
    if (fullName.toLowerCase() === normalized) return fullName;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function normalizeSubmissionInput(body) {
  const stageName = String(body.stageName || "").trim();
  const email = String(body.email || "").trim();

  return {
    stageName,
    fullName: String(body.fullName || "").trim(),
    genre: String(body.genre || "").trim(),
    city: String(body.city || "").trim(),
    state: normalizeState(body.state),
    phoneNumber: normalizePhone(body.phoneNumber),
    experienceLevel: String(body.experienceLevel || "").trim(),
    age: String(body.age || "").trim(),
    email,
    socialMedia: String(body.socialMedia || "").trim(),
    heardAbout: String(body.heardAbout || "").trim(),
    stageNameLower: stageName.toLowerCase(),
    emailLower: email.toLowerCase()
  };
}

router.post("/", publicSubmissionLimiter, async (req, res) => {
  try {
    const data = normalizeSubmissionInput(req.body);

    if (!data.stageName || !data.fullName || !data.age || !data.email) {
      return res.status(400).json({ error: "Missing required fields: stageName, fullName, age, email" });
    }

    const existingProfile = await DJProfile.exists({
      stageNameLower: data.stageNameLower,
      emailLower: data.emailLower
    });
    if (existingProfile) {
      return res.status(409).json({ error: "This profile already exists in the DJ database." });
    }

    const created = await DJSubmission.create(data);
    return res.status(201).json({ ok: true, id: created.id });
  } catch (e) {
    if (e && e.name === "ValidationError") {
      return res.status(400).json({ error: "One or more fields are invalid or too long." });
    }
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "This profile has already been submitted for approval." });
    }
    return res.status(500).json({ error: "Failed to submit profile" });
  }
});

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const submissions = await DJSubmission.find({}).sort({ createdAt: -1 });
    return res.json(submissions.map((submission) => submission.toJSON()));
  } catch (_e) {
    return res.status(500).json({ error: "Failed to load submissions" });
  }
});

router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const submission = await DJSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const profileData = {
      stageName: submission.stageName,
      fullName: submission.fullName,
      genre: submission.genre || "",
      city: submission.city || "",
      state: submission.state || "",
      phoneNumber: submission.phoneNumber || "",
      experienceLevel: submission.experienceLevel || "",
      age: submission.age,
      email: submission.email,
      socialMedia: submission.socialMedia || "",
      heardAbout: submission.heardAbout || "",
      internalNotes: "",
      flagNote: "",
      stageNameLower: submission.stageNameLower,
      emailLower: submission.emailLower
    };

    const profile = await DJProfile.create(profileData);
    await DJSubmission.deleteOne({ _id: submission._id });

    return res.status(201).json({ ok: true, profile: profile.toJSON() });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "A profile with this stage name and email already exists." });
    }
    return res.status(500).json({ error: "Failed to approve submission" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await DJSubmission.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Submission not found" });
    return res.json({ ok: true });
  } catch (_e) {
    return res.status(500).json({ error: "Failed to reject submission" });
  }
});

module.exports = router;
