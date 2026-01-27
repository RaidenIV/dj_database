function getToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const x = req.headers["x-admin-token"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return "";
}

function requireAdmin(req, res, next) {
  const adminToken = (process.env.ADMIN_TOKEN || "").trim();

  // If you didn't set ADMIN_TOKEN, allow requests (not recommended for production).
  if (!adminToken) return next();

  const got = getToken(req);
  if (!got || got !== adminToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function allowPublicCreate(req, res, next) {
  const publicSubmissions = String(process.env.PUBLIC_SUBMISSIONS || "false").toLowerCase() === "true";
  if (publicSubmissions) return next(); // allow POST without admin token
  return requireAdmin(req, res, next);
}

module.exports = { requireAdmin, allowPublicCreate };
