/* global Papa, Chart */
(() => {
  const API_BASE = window.location.origin.replace(/\/$/, "");
  let ADMIN_TOKEN = (localStorage.getItem("djAdminToken") || "").trim();

  const $ = (id) => document.getElementById(id);

  // ----------------------------
  // Mini console + admin banner
  // ----------------------------
  const consoleEl = () => $("miniConsole");
  const bannerEl = () => $("adminBanner");

  function ts() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function logLine(message, kind = "info") {
    const el = consoleEl();
    if (!el) return;
    const div = document.createElement("div");
    div.className = `console-line console-${kind}`;
    div.innerHTML = `<span class="console-ts">${ts()}</span>${escapeHtml(message)}`;
    el.appendChild(div);
    // keep last ~40 lines
    while (el.childNodes.length > 40) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function setAdminBanner(state, text) {
    const el = bannerEl();
    if (!el) return;
    el.classList.remove("authorized", "unauthorized");
    el.classList.add(state === "authorized" ? "authorized" : "unauthorized");
    el.textContent = text;
  }

  function setStatus(msg, kind) {
    const el = $("serverStatus");
    if (!el) return;
    el.className = "status-message " + (kind || "");
    el.textContent = msg || "";
  }

  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    if (ADMIN_TOKEN) {
      h["Authorization"] = "Bearer " + ADMIN_TOKEN;
      h["X-Admin-Token"] = ADMIN_TOKEN;
    }
    return h;
  }

  async function checkServerHealth() {
    try {
      const r = await fetch(API_BASE + "/health");
      if (!r.ok) throw new Error("Health check failed");
      const j = await r.json();
      if (j && j.mongoState === 1) {
        logLine("Server connected (MongoDB OK).", "ok");
        setStatus("Connected", "success");
      } else {
        logLine("Server online (Mongo connecting).", "warn");
        setStatus("Server online (Mongo connecting)", "warning");
      }
      return true;
    } catch (_e) {
      logLine("Server connection failed.", "red");
      setStatus("Server not reachable", "warning");
      return false;
    }
  }

  async function checkAuthState() {
    // Use /api/djs as the definitive admin-gated endpoint.
    try {
      const r = await fetch(API_BASE + "/api/djs", { headers: authHeaders() });
      if (r.status === 401) {
        setAdminBanner("unauthorized", "Unauthorized");
        if (ADMIN_TOKEN) logLine("Unauthorized (token rejected).", "red");
        else logLine("Unauthorized (token not set).", "warn");
        return false;
      }
      if (!r.ok) {
        setAdminBanner("unauthorized", "Error");
        logLine("Auth check error (server responded " + r.status + ").", "warn");
        return false;
      }
      setAdminBanner("authorized", "Admin mode");
      logLine("Authorized (Admin mode enabled).", "ok");
      return true;
    } catch (_e) {
      setAdminBanner("unauthorized", "Offline");
      return false;
    }
  }

  function saveAdminToken() {
    ADMIN_TOKEN = ($("adminToken").value || "").trim();
    localStorage.setItem("djAdminToken", ADMIN_TOKEN);
    logLine(ADMIN_TOKEN ? "Admin token saved." : "Admin token cleared.", "info");
    // Refresh auth + data
    (async () => {
      await checkAuthState();
      await loadProfiles();
      applyFilters();
      updateCharts();
    })();
  }

  // ----------------------------
  // CSV load + explicit Save to Server
  // ----------------------------
  let pendingCsvFile = null;
  let pendingCsvCount = 0;

  function openCsvPicker() {
    $("csvFile").click();
  }

  function setSaveCsvEnabled(on) {
    const btn = $("btnSaveToServer");
    btn.disabled = !on;
  }

  function handleCsvSelected(file) {
    pendingCsvFile = null;
    pendingCsvCount = 0;
    setSaveCsvEnabled(false);

    if (!file) return;

    // Quick parse to count rows (local only) so you know what you're about to upload
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = Array.isArray(results.data) ? results.data : [];
        pendingCsvFile = file;
        pendingCsvCount = rows.length;
        setSaveCsvEnabled(true);
        logLine(`CSV loaded locally: ${file.name} (${pendingCsvCount} rows). Click "Save CSV to Server".`, "blue");
      },
      error: (err) => {
        logLine("CSV parse failed: " + (err?.message || "unknown error"), "red");
      }
    });
  }

  async function saveCsvToServer() {
    if (!pendingCsvFile) {
      logLine("No CSV loaded. Click "Load CSV" first.", "warn");
      return;
    }

    const fd = new FormData();
    fd.append("file", pendingCsvFile);

    logLine(`Uploading CSV to server (${pendingCsvCount} rows)…`, "info");

    const r = await fetch(API_BASE + "/api/djs/import", {
      method: "POST",
      headers: authHeaders(),
      body: fd
    });

    if (r.status === 401) {
      logLine("Upload blocked: Unauthorized. Set Admin Token.", "red");
      alert("Unauthorized. Paste Admin Token and click Save Token.");
      return;
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logLine("Upload failed: " + (t || r.status), "red");
      alert("Upload failed: " + (t || r.status));
      return;
    }

    const j = await r.json().catch(() => ({}));
    logLine(`Upload complete. Upserted: ${j.upserted ?? "?"}, Updated: ${j.updated ?? "?"}, Skipped: ${j.skipped ?? "?"}.`, "ok");

    // Clear pending
    pendingCsvFile = null;
    pendingCsvCount = 0;
    setSaveCsvEnabled(false);
    $("csvFile").value = "";

    // Refresh list from server
    await loadProfiles();
    applyFilters();
    updateCharts();
  }

  // ----------------------------
  // State / helpers
  // ----------------------------
  let profiles = [];
  let currentEditId = null;

  function updateCountLabel() {
    const el = $("profileCount");
    if (!el) return;
    if (profiles.length > 0) el.textContent = `${profiles.length} DJ profile${profiles.length !== 1 ? "s" : ""} loaded`;
    else el.textContent = "Manage and organize DJ profiles";
  }

  function normalizePhoneDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  function formatPhone(raw) {
    const digits = normalizePhoneDigits(raw);
    if (digits.length === 10) return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
    return String(raw || "");
  }

  function truncate(str, max = 44) {
    const s = String(str || "");
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
  }

  async function loadProfiles() {
    try {
      const r = await fetch(API_BASE + "/api/djs", { headers: authHeaders() });
      if (r.status === 401) {
        profiles = [];
        updateCountLabel();
        displayProfiles([]);
        logLine("Profiles not loaded: Unauthorized.", "warn");
        return;
      }
      if (!r.ok) throw new Error("Load failed");
      profiles = await r.json();
      updateCountLabel();
      logLine(`Profiles loaded: ${profiles.length}`, "info");
    } catch (_e) {
      profiles = [];
      updateCountLabel();
      displayProfiles([]);
      logLine("Failed to load profiles.", "red");
    }
  }

  // ----------------------------
  // Modal
  // ----------------------------
  function openCreateModal() {
    currentEditId = null;
    $("modalTitle").textContent = "Create Profile";
    $("profileForm").reset();
    $("profileModal").style.display = "block";
  }

  function openEditModal(id) {
    currentEditId = id;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;

    $("modalTitle").textContent = "Update Profile";
    $("stageName").value = p.stageName || "";
    $("fullName").value = p.fullName || "";
    $("city").value = p.city || "";
    $("state").value = p.state || "";
    $("phoneNumber").value = formatPhone(p.phoneNumber || "");
    $("experienceLevel").value = p.experienceLevel || "";
    $("age").value = p.age || "";
    $("email").value = p.email || "";
    $("socialMedia").value = p.socialMedia || "";
    $("heardAbout").value = p.heardAbout || "";

    $("profileModal").style.display = "block";
  }

  function closeModal() {
    $("profileModal").style.display = "none";
  }

  // ----------------------------
  // CRUD
  // ----------------------------
  async function saveProfile(e) {
    e.preventDefault();

    const phoneDigits = normalizePhoneDigits($("phoneNumber").value);

    const payload = {
      stageName: $("stageName").value.trim(),
      fullName: $("fullName").value.trim(),
      city: $("city").value.trim(),
      state: $("state").value.trim(),
      phoneNumber: phoneDigits,
      experienceLevel: $("experienceLevel").value.trim(),
      age: $("age").value.trim(),
      email: $("email").value.trim(),
      socialMedia: $("socialMedia").value.trim(),
      heardAbout: $("heardAbout").value.trim()
    };

    const url = currentEditId ? `${API_BASE}/api/djs/${encodeURIComponent(currentEditId)}` : `${API_BASE}/api/djs`;
    const method = currentEditId ? "PUT" : "POST";

    const r = await fetch(url, {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (r.status === 401) {
      logLine("Save blocked: Unauthorized.", "red");
      return alert("Unauthorized. Paste Admin Token and click Save Token.");
    }
    if (r.status === 409) {
      logLine("Save failed: Duplicate profile (stageName + email).", "warn");
      return alert("Duplicate profile (stageName + email).");
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logLine("Save failed: " + (t || r.status), "red");
      return alert("Save failed: " + (t || r.status));
    }

    if (method === "POST") logLine("New profile created.", "blue");
    else logLine("Profile saved.", "blue");

    await loadProfiles();
    applyFilters();
    updateCharts();
    closeModal();
  }

  async function deleteProfile(id) {
    if (!confirm("Are you sure you want to delete this profile?")) return;

    const r = await fetch(`${API_BASE}/api/djs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    if (r.status === 401) {
      logLine("Delete blocked: Unauthorized.", "red");
      return alert("Unauthorized. Paste Admin Token and click Save Token.");
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logLine("Delete failed: " + (t || r.status), "red");
      return alert("Delete failed: " + (t || r.status));
    }

    logLine("Profile deleted.", "red");
    await loadProfiles();
    applyFilters();
    updateCharts();
  }

  // ----------------------------
  // Filtering / Sorting / Display
  // ----------------------------
  function sortProfiles(arr, sortBy) {
    const s = [...arr];
    switch (sortBy) {
      case "stageName":
        return s.sort((a, b) => (a.stageName || "").toLowerCase().localeCompare((b.stageName || "").toLowerCase()));
      case "stageName-desc":
        return s.sort((a, b) => (b.stageName || "").toLowerCase().localeCompare((a.stageName || "").toLowerCase()));
      case "fullName":
        return s.sort((a, b) => (a.fullName || "").toLowerCase().localeCompare((b.fullName || "").toLowerCase()));
      case "fullName-desc":
        return s.sort((a, b) => (b.fullName || "").toLowerCase().localeCompare((a.fullName || "").toLowerCase()));
      case "age":
        return s.sort((a, b) => (a.age || "").localeCompare(b.age || ""));
      case "experience":
        return s.sort((a, b) => (a.experienceLevel || "").localeCompare(b.experienceLevel || ""));
      case "city":
        return s.sort((a, b) => (a.city || "").toLowerCase().localeCompare((b.city || "").toLowerCase()));
      default:
        return s;
    }
  }

  function applyFilters() {
    const searchTerm = ($("searchInput").value || "").toLowerCase();
    const sortBy = $("sortBy").value;
    const displayCount = $("displayCount").value;

    let filtered = profiles.filter((p) => {
      const fields = [
        p.stageName,
        p.fullName,
        p.city,
        p.state,
        p.email,
        p.phoneNumber
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fields.includes(searchTerm);
    });

    filtered = sortProfiles(filtered, sortBy);

    if (displayCount !== "all") filtered = filtered.slice(0, parseInt(displayCount, 10));

    displayProfiles(filtered);
  }

  function updateCardSize() {
    const size = $("cardSize").value;
    $("profilesContainer").className = "profiles-grid size-" + size;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayProfiles(arr) {
    const c = $("profilesContainer");

    if (!arr.length) {
      c.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎧</div>
          <div class="empty-state-text">No DJ Profiles</div>
          <div class="empty-state-hint">Load a CSV and click "Save CSV to Server", or create a profile.</div>
        </div>
      `;
      return;
    }

    c.innerHTML = arr
      .map((p) => {
        const phoneDisp = p.phoneNumber ? formatPhone(p.phoneNumber) : "";
        const socialDisp = p.socialMedia ? truncate(p.socialMedia, 46) : "";
        const sourceDisp = p.heardAbout ? truncate(p.heardAbout, 34) : "";

        return `
        <div class="profile-card">
          <div class="profile-info">
            <div class="stage-name">${escapeHtml(p.stageName || "")}</div>
            <div class="legal-name">${escapeHtml(p.fullName || "")}</div>
            <div class="divider"></div>

            <div class="profile-details">
              ${(p.city || p.state) ? `
                <div class="profile-detail">
                  <span class="detail-label">Location:</span>
                  <span class="detail-value">${escapeHtml([p.city, p.state].filter(Boolean).join(", ") || "N/A")}</span>
                </div>` : ""
              }

              ${phoneDisp ? `
                <div class="profile-detail">
                  <span class="detail-label">Phone:</span>
                  <span class="detail-value">${escapeHtml(phoneDisp)}</span>
                </div>` : ""
              }

              ${p.experienceLevel ? `
                <div class="profile-detail">
                  <span class="detail-label">Experience:</span>
                  <span class="detail-value">${escapeHtml(p.experienceLevel)}</span>
                </div>` : ""
              }

              <div class="profile-detail">
                <span class="detail-label">Age:</span>
                <span class="detail-value">${escapeHtml(p.age || "")}</span>
              </div>

              <div class="profile-detail">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${escapeHtml(p.email || "")}</span>
              </div>

              ${socialDisp ? `
                <div class="profile-detail">
                  <span class="detail-label">Social:</span>
                  <span class="detail-value truncate" title="${escapeHtml(p.socialMedia || "")}">${escapeHtml(socialDisp)}</span>
                </div>` : ""
              }

              ${sourceDisp ? `
                <div class="profile-detail">
                  <span class="detail-label">Source:</span>
                  <span class="detail-value truncate" title="${escapeHtml(p.heardAbout || "")}">${escapeHtml(sourceDisp)}</span>
                </div>` : ""
              }
            </div>

            <div class="divider"></div>
            <div class="profile-actions">
              <button type="button" data-action="edit" data-id="${p.id}">Update</button>
              <button type="button" data-action="delete" data-id="${p.id}">Delete</button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    c.querySelectorAll("button[data-action]").forEach((btn) => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      btn.addEventListener("click", () => {
        if (action === "edit") openEditModal(id);
        if (action === "delete") deleteProfile(id);
      });
    });
  }

  // ----------------------------
  // Charts (unchanged)
  // ----------------------------
  let chartInstances = {};

  function toggleAnalytics() {
    const content = $("analyticsContent");
    const btn = $("toggleAnalyticsBtn");
    if (content.classList.contains("hidden")) {
      content.classList.remove("hidden");
      btn.textContent = "Hide Dashboard";
    } else {
      content.classList.add("hidden");
      btn.textContent = "Show Dashboard";
    }
  }

  function updateChartVisibility() {
    $("experienceContainer").style.display = $("showExperience").checked ? "block" : "none";
    $("ageContainer").style.display = $("showAge").checked ? "block" : "none";
    $("locationContainer").style.display = $("showLocation").checked ? "block" : "none";
    $("referralContainer").style.display = $("showReferral").checked ? "block" : "none";
  }

  function updateCharts() {
    if (!profiles.length) return;

    const expCounts = {};
    profiles.forEach((p) => {
      const k = p.experienceLevel || "Not specified";
      expCounts[k] = (expCounts[k] || 0) + 1;
    });
    createChart("experienceChart", expCounts, "bar");

    const ageCounts = {};
    profiles.forEach((p) => {
      const k = p.age || "Not specified";
      ageCounts[k] = (ageCounts[k] || 0) + 1;
    });
    createChart("ageChart", ageCounts, "doughnut");

    const stateCounts = {};
    profiles.forEach((p) => {
      if (p.state) stateCounts[p.state] = (stateCounts[p.state] || 0) + 1;
    });
    const topStates = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((o, [k, v]) => ((o[k] = v), o), {});
    createChart("locationChart", topStates, "bar");

    const refCounts = {};
    profiles.forEach((p) => {
      if (p.heardAbout) {
        p.heardAbout.split(";").forEach((s) => {
          const c = s.trim();
          if (c) refCounts[c] = (refCounts[c] || 0) + 1;
        });
      }
    });
    createChart("referralChart", refCounts, "pie");
  }

  function createChart(canvasId, data, type) {
    const canvas = $(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

    const labels = Object.keys(data);
    const values = Object.values(data);

    const brightColors = [
      "rgba(59, 130, 246, 0.8)",
      "rgba(16, 185, 129, 0.8)",
      "rgba(239, 68, 68, 0.8)",
      "rgba(245, 158, 11, 0.8)",
      "rgba(168, 85, 247, 0.8)",
      "rgba(236, 72, 153, 0.8)",
      "rgba(6, 182, 212, 0.8)",
      "rgba(132, 204, 22, 0.8)",
      "rgba(251, 146, 60, 0.8)",
      "rgba(99, 102, 241, 0.8)"
    ];

    const borderColors = [
      "rgba(59, 130, 246, 1)",
      "rgba(16, 185, 129, 1)",
      "rgba(239, 68, 68, 1)",
      "rgba(245, 158, 11, 1)",
      "rgba(168, 85, 247, 1)",
      "rgba(236, 72, 153, 1)",
      "rgba(6, 182, 212, 1)",
      "rgba(132, 204, 22, 1)",
      "rgba(251, 146, 60, 1)",
      "rgba(99, 102, 241, 1)"
    ];

    const ctx = canvas.getContext("2d");
    const isBar = type === "bar";

    chartInstances[canvasId] = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{ label: "Count", data: values, backgroundColor: brightColors, borderColor: borderColors, borderWidth: 2 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: type !== "bar",
            position: "bottom",
            labels: { color: "#f2f2f4", font: { family: "Rajdhani", size: 12 }, padding: 12 }
          },
          title: { display: false }
        },
        scales: isBar
          ? {
              y: { beginAtZero: true, ticks: { color: "#a7a7ad", font: { family: "Rajdhani", size: 12 } }, grid: { color: "#2a2a2f" } },
              x: { ticks: { color: "#a7a7ad", font: { family: "Rajdhani", size: 12 } }, grid: { color: "#2a2a2f" } }
            }
          : {}
      }
    });
  }

  // ----------------------------
  // Navigation menu
  // ----------------------------
  function setupNavigation() {
    const navDropdown = $("navDropdown");
    const navToggle = $("navToggle");

    navToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      navDropdown.classList.toggle("active");
    });

    document.addEventListener("click", () => navDropdown.classList.remove("active"));
    navDropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  // ----------------------------
  // Wiring
  // ----------------------------
  function wireUI() {
    $("adminToken").value = ADMIN_TOKEN;

    $("btnSaveToken").addEventListener("click", (e) => {
      e.preventDefault();
      saveAdminToken();
    });

    $("btnCreate").addEventListener("click", openCreateModal);
    $("btnExport").addEventListener("click", exportCSV);
    $("btnLoadCsv").addEventListener("click", openCsvPicker);
    $("btnSaveToServer").addEventListener("click", saveCsvToServer);

    $("csvFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      handleCsvSelected(f);
    });

    $("searchInput").addEventListener("input", applyFilters);
    $("sortBy").addEventListener("change", applyFilters);
    $("displayCount").addEventListener("change", applyFilters);
    $("cardSize").addEventListener("change", () => {
      updateCardSize();
      applyFilters();
    });

    $("toggleAnalyticsBtn").addEventListener("click", toggleAnalytics);
    ["showExperience", "showAge", "showLocation", "showReferral"].forEach((id) => $(id).addEventListener("change", updateChartVisibility));

    $("modalClose").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);
    $("profileForm").addEventListener("submit", saveProfile);

    // Phone formatting on blur
    $("phoneNumber").addEventListener("blur", () => {
      $("phoneNumber").value = formatPhone($("phoneNumber").value);
    });

    $("profileModal").addEventListener("click", (e) => {
      if (e.target && e.target.id === "profileModal") closeModal();
    });
  }

  // Export CSV (server-side)
  async function exportCSV() {
    if (!profiles.length) return alert("No profiles to export!");

    const r = await fetch(API_BASE + "/api/djs/export.csv", { headers: authHeaders() });
    if (r.status === 401) {
      logLine("Export blocked: Unauthorized.", "red");
      return alert("Unauthorized. Paste Admin Token and click Save Token.");
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logLine("Export failed: " + (t || r.status), "red");
      return alert("Export failed: " + (t || r.status));
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dj-profiles-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logLine("Exported CSV.", "ok");
  }

  window.addEventListener("DOMContentLoaded", async () => {
    // initial lines
    logLine("DJ Database loaded.", "info");

    wireUI();
    setupNavigation();
    updateCardSize();
    updateChartVisibility();

    await checkServerHealth();
    await checkAuthState();
    await loadProfiles();
    applyFilters();
    updateCharts();
  });
})();
