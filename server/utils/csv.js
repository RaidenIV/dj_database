const { parse } = require("csv-parse/sync");

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

    out.push({
      stageName,
      fullName: pick(row, ["Name (First & Last):", "Name (First & Last)", "fullName"]),
      city: pick(row, ["City", "city"]),
      state: pick(row, ["State", "state"]),
      phoneNumber: pick(row, ["Phone Number", "phoneNumber"]),
      experienceLevel: pick(row, ["Experience Level:", "Experience Level", "experienceLevel"]),
      age: pick(row, ["Age", "age"]),
      email: pick(row, ["Email:", "Email", "email"]),
      socialMedia: pick(row, ["Social Media Links:", "Social Media Links", "socialMedia"]),
      heardAbout: pick(row, ["How did you hear about us?", "heardAbout"])
    });
  }
  return out;
}

module.exports = { parseCsv };
