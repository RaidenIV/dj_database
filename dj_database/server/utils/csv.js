const { stringify } = require("csv-stringify/sync");
const { parse } = require("csv-parse/sync");

const CSV_COLUMNS = [
  "Stage Name",
  "Name (First & Last)",
  "City",
  "State",
  "Phone Number",
  "Experience Level",
  "Age",
  "Email",
  "Social Media Links",
  "How did you hear about us?"
];

function toCsv(profiles) {
  const records = profiles.map((p) => ({
    "Stage Name": p.stageName || "",
    "Name (First & Last)": p.fullName || "",
    "City": p.city || "",
    "State": p.state || "",
    "Phone Number": p.phoneNumber || "",
    "Experience Level": p.experienceLevel || "",
    "Age": p.age || "",
    "Email": p.email || "",
    "Social Media Links": p.socialMedia || "",
    "How did you hear about us?": p.heardAbout || ""
  }));

  return stringify(records, {
    header: true,
    columns: CSV_COLUMNS
  });
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim();
  }
  return "";
}

function parseCsv(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer || "");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true
  });

  const out = [];
  for (const row of rows) {
    const stageName = pick(row, ["Stage Name:", "Stage Name", "stageName"]);
    if (!stageName) continue;

    const fullName = pick(row, ["Name (First & Last):", "Name (First & Last)", "fullName"]);
    const city = pick(row, ["City", "city"]);
    const state = pick(row, ["State", "state"]);
    const phoneNumber = pick(row, ["Phone Number", "phoneNumber"]);
    const experienceLevel = pick(row, ["Experience Level:", "Experience Level", "experienceLevel"]);
    const age = pick(row, ["Age", "age"]);
    const email = pick(row, ["Email:", "Email", "email"]);
    const socialMedia = pick(row, ["Social Media Links:", "Social Media Links", "socialMedia"]);
    const heardAbout = pick(row, ["How did you hear about us?", "heardAbout"]);

    out.push({
      stageName,
      fullName,
      city,
      state,
      phoneNumber,
      experienceLevel,
      age,
      email,
      socialMedia,
      heardAbout
    });
  }
  return out;
}

module.exports = { toCsv, parseCsv };
