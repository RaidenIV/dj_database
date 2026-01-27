/* global Papa, Chart */

(() => {
  // ----------------------------
  // Server config (stored in localStorage)
  // ----------------------------
  let API_BASE = (localStorage.getItem("djApiBase") || "").trim().replace(/\/$/, "");
  let ADMIN_TOKEN = (localStorage.getItem("djAdminToken") || "").trim();

  function isServerConfigured() {
    return !!API_BASE && API_BASE.startsWith("http");
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    const el = $("serverStatus");
    if (!el) return;
    el.className = "status-message " + (kind || "");
    el.textContent = msg || "";
  }

  async function checkServerHealth() {
    if (!isServerConfigured()) {
      setStatus("Local mode: no API configured. Data will be stored in this browser only.", "warning");
      return false;
    }
    try {
      const r = await fetch(API_BASE + "/health", { method: "GET" });
      if (!r.ok) throw new Error("Health check failed");
      setStatus("Connected to server. Data is saved in MongoDB.", "success");
      return true;
    } catch (_e) {
      setStatus("API configured, but server is not reachable. Falling back to local mode.", "warning");
      return false;
    }
  }

  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    if (ADMIN_TOKEN) {
      h["Authorization"] = "Bearer " + ADMIN_TOKEN;
      h["X-Admin-Token"] = ADMIN_TOKEN;
    }
    return h;
  }

  function saveServerSettings() {
    const base = ($("apiBase").value || "").trim().replace(/\/$/, "");
    const token = ($("adminToken").value || "").trim();

    API_BASE = base;
    ADMIN_TOKEN = token;

    localStorage.setItem("djApiBase", API_BASE);
    localStorage.setItem("djAdminToken", ADMIN_TOKEN);

    (async () => {
      await checkServerHealth();
      await loadProfiles();
      applyFilters();
      updateCharts();
    })();
  }

  // ----------------------------
  // Data storage
  // ----------------------------
  let profiles = [];
  let currentEditId = null;

  async function loadProfiles() {
    if (isServerConfigured()) {
      try {
        const r = await fetch(API_BASE + "/api/djs", { headers: authHeaders() });
        if (!r.ok) throw new Error("Failed to load");
        profiles = await r.json();
        updateCountLabel();
        return;
      } catch (_e) {
        // fall through to local
      }
    }

    const stored = localStorage.getItem("djProfiles");
    profiles = stored ? JSON.parse(stored) : [];
    updateCountLabel();
  }

  function saveToLocalStorage() {
    localStorage.setItem("djProfiles", JSON.stringify(profiles));
  }

  function updateCountLabel() {
    const countEl = $("profileCount");
    if (!countEl) return;
    if (profiles.length > 0) {
      countEl.textContent = `${profiles.length} DJ profile${profiles.length !== 1 ? "s" : ""} loaded`;
    } else {
      countEl.textContent = "Manage and organize DJ profiles";
    }
  }

  // ----------------------------
  // Modal
  // ----------------------------
  function openCreateModal() {
    currentEditId = null;
    $("modalTitle").textContent = "Create Profile";
    $("profileForm").reset();
    $("profileId").value = "";
    $("profileModal").style.display = "block";
  }

  function openEditModal(id) {
    currentEditId = id;
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;

    $("modalTitle").textContent = "Update Profile";
    $("profileId").value = profile.id;
    $("stageName").value = profile.stageName || "";
    $("fullName").value = profile.fullName || "";
    $("city").value = profile.city || "";
    $("state").value = profile.state || "";
    $("phoneNumber").value = profile.phoneNumber || "";
    $("experienceLevel").value = profile.experienceLevel || "";
    $("age").value = profile.age || "";
    $("email").value = profile.email || "";
    $("socialMedia").value = profile.socialMedia || "";

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

    const stageName = $("stageName").value.trim();
    const fullName = $("fullName").value.trim();
    const city = $("city").value.trim();
    const state = $("state").value.trim();
    const phoneNumber = $("phoneNumber").value.trim();
    const experienceLevel = $("experienceLevel").value.trim();
    const age = $("age").value.trim();
    const email = $("email").value.trim();
    const socialMedia = $("socialMedia").value.trim();

    // client duplicate guard (server also enforces)
    const duplicate = profiles.find(
      (p) =>
        p.id !== currentEditId &&
        (p.stageName || "").toLowerCase() === stageName.toLowerCase() &&
        (p.email || "").toLowerCase() === email.toLowerCase()
    );
    if (duplicate) {
      alert(`A profile with stage name "${stageName}" and email "${email}" already exists.`);
      return;
    }

    const payload = {
      stageName,
      fullName,
      city,
      state,
      phoneNumber,
      experienceLevel,
      age,
      email,
      socialMedia,
      heardAbout: ""
    };

    if (isServerConfigured()) {
      try {
        const url = currentEditId ? `${API_BASE}/api/djs/${encodeURIComponent(currentEditId)}` : `${API_BASE}/api/djs`;
        const method = currentEditId ? "PUT" : "POST";
        const r = await fetch(url, {
          method,
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload)
        });

        if (r.status === 409) {
          alert("Duplicate profile (stageName + email).");
          return;
        }
        if (!r.ok) throw new Error("Save failed");

        const saved = await r.json();

        if (currentEditId) {
          const idx = profiles.findIndex((p) => p.id === currentEditId);
          if (idx >= 0) profiles[idx] = saved;
          else profiles.unshift(saved);
        } else {
          profiles.unshift(saved);
        }

        updateCountLabel();
        applyFilters();
        updateCharts();
        closeModal();
        return;
      } catch (_e) {
        alert("Server save failed. Falling back to local mode for this action.");
      }
    }

    // Local mode
    const profile = {
      id: currentEditId || Date.now().toString(),
      ...payload
    };

    if (currentEditId) {
      const index = profiles.findIndex((p) => p.id === currentEditId);
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }

    saveToLocalStorage();
    updateCountLabel();
    applyFilters();
    updateCharts();
    closeModal();
  }

  async function deleteProfile(id) {
    if (!confirm("Are you sure you want to delete this profile?")) return;

    if (isServerConfigured()) {
      try {
        const r = await fetch(`${API_BASE}/api/djs/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
        if (!r.ok) throw new Error("Delete failed");

        profiles = profiles.filter((p) => p.id !== id);
        updateCountLabel();
        applyFilters();
        updateCharts();
        return;
      } catch (_e) {
        alert("Server delete failed. Falling back to local mode for this action.");
      }
    }

    profiles = profiles.filter((p) => p.id !== id);
    saveToLocalStorage();
    updateCountLabel();
    applyFilters();
    updateCharts();
  }

  // ----------------------------
  // Filtering / Sorting / Display
  // ----------------------------
  function sortProfiles(arr, sortBy) {
    const sorted = [...arr];
    switch (sortBy) {
      case "stageName":
        return sorted.sort((a, b) => (a.stageName || "").toLowerCase().localeCompare((b.stageName || "").toLowerCase()));
      case "stageName-desc":
        return sorted.sort((a, b) => (b.stageName || "").toLowerCase().localeCompare((a.stageName || "").toLowerCase()));
      case "fullName":
        return sorted.sort((a, b) => (a.fullName || "").toLowerCase().localeCompare((b.fullName || "").toLowerCase()));
      case "fullName-desc":
        return sorted.sort((a, b) => (b.fullName || "").toLowerCase().localeCompare((a.fullName || "").toLowerCase()));
      case "age":
        return sorted.sort((a, b) => (a.age || "").localeCompare(b.age || ""));
      case "experience":
        return sorted.sort((a, b) => (a.experienceLevel || "").localeCompare(b.experienceLevel || ""));
      case "city":
        return sorted.sort((a, b) => (a.city || "").toLowerCase().localeCompare((b.city || "").toLowerCase()));
      default:
        return sorted;
    }
  }

  function applyFilters() {
    const searchTerm = ($("searchInput").value || "").toLowerCase();
    const sortBy = $("sortBy").value;
    const displayCount = $("displayCount").value;

    let filtered = profiles.filter((p) => {
      const fields = [
        p.stageName || "",
        p.fullName || "",
        p.city || "",
        p.state || "",
        p.email || "",
        p.phoneNumber || ""
      ].join(" ").toLowerCase();
      return fields.includes(searchTerm);
    });

    filtered = sortProfiles(filtered, sortBy);

    if (displayCount !== "all") {
      filtered = filtered.slice(0, parseInt(displayCount, 10));
    }

    displayProfiles(filtered);
  }

  function updateCardSize() {
    const size = $("cardSize").value;
    const container = $("profilesContainer");
    container.className = "profiles-grid size-" + size;
  }

  function displayProfiles(arr) {
    const container = $("profilesContainer");

    if (!arr.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎧</div>
          <div class="empty-state-text">No DJ Profiles</div>
          <div class="empty-state-hint">Create your first profile or import a CSV file to get started</div>
        </div>
      `;
      return;
    }

    container.innerHTML = arr
      .map(
        (p) => `
      <div class="profile-card">
        <div class="profile-info">
          <div class="stage-name">${escapeHtml(p.stageName || "")}</div>
          <div class="legal-name">${escapeHtml(p.fullName || "")}</div>
          <div class="divider"></div>

          <div class="profile-details">
            ${p.city || p.state ? `
              <div class="profile-detail">
                <span class="detail-label">Location:</span>
                <span>${escapeHtml([p.city, p.state].filter(Boolean).join(", ") || "N/A")}</span>
              </div>` : ""
            }

            ${p.phoneNumber ? `
              <div class="profile-detail">
                <span class="detail-label">Phone:</span>
                <span>${escapeHtml(p.phoneNumber)}</span>
              </div>` : ""
            }

            ${p.experienceLevel ? `
              <div class="profile-detail">
                <span class="detail-label">Experience:</span>
                <span>${escapeHtml(p.experienceLevel)}</span>
              </div>` : ""
            }

            <div class="profile-detail">
              <span class="detail-label">Age:</span>
              <span>${escapeHtml(p.age || "")}</span>
            </div>

            <div class="profile-detail">
              <span class="detail-label">Email:</span>
              <span>${escapeHtml(p.email || "")}</span>
            </div>

            ${p.socialMedia ? `
              <div class="profile-detail">
                <span class="detail-label">Social:</span>
                <span>${escapeHtml(p.socialMedia)}</span>
              </div>` : ""
            }

            ${p.heardAbout ? `
              <div class="profile-detail">
                <span class="detail-label">Source:</span>
                <span>${escapeHtml(p.heardAbout)}</span>
              </div>` : ""
            }
          </div>

          <div class="divider"></div>
          <div class="profile-actions">
            <button data-action="edit" data-id="${p.id}">Update</button>
            <button data-action="delete" data-id="${p.id}">Delete</button>
          </div>
        </div>
      </div>
    `
      )
      .join("");

    // Button delegation
    container.querySelectorAll("button[data-action]").forEach((btn) => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      btn.addEventListener("click", () => {
        if (action === "edit") openEditModal(id);
        if (action === "delete") deleteProfile(id);
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------------------------
  // Analytics (Charts)
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

    const experienceCounts = {};
    profiles.forEach((p) => {
      const exp = p.experienceLevel || "Not specified";
      experienceCounts[exp] = (experienceCounts[exp] || 0) + 1;
    });
    createChart("experienceChart", experienceCounts, "bar");

    const ageCounts = {};
    profiles.forEach((p) => {
      const age = p.age || "Not specified";
      ageCounts[age] = (ageCounts[age] || 0) + 1;
    });
    createChart("ageChart", ageCounts, "doughnut");

    const stateCounts = {};
    profiles.forEach((p) => {
      if (p.state) stateCounts[p.state] = (stateCounts[p.state] || 0) + 1;
    });
    const topStates = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [k, v]) => ((obj[k] = v), obj), {});
    createChart("locationChart", topStates, "bar");

    const referralCounts = {};
    profiles.forEach((p) => {
      if (p.heardAbout) {
        p.heardAbout.split(";").forEach((s) => {
          const cleaned = s.trim();
          if (cleaned) referralCounts[cleaned] = (referralCounts[cleaned] || 0) + 1;
        });
      }
    });
    createChart("referralChart", referralCounts, "pie");
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
    const isBarChart = type === "bar";

    chartInstances[canvasId] = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [
          {
            label: "Count",
            data: values,
            backgroundColor: brightColors,
            borderColor: borderColors,
            borderWidth: 2
          }
        ]
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
        scales: isBarChart
          ? {
              y: { beginAtZero: true, ticks: { color: "#a7a7ad", font: { family: "Rajdhani", size: 12 } }, grid: { color: "#2a2a2f" } },
              x: { ticks: { color: "#a7a7ad", font: { family: "Rajdhani", size: 12 } }, grid: { color: "#2a2a2f" } }
            }
          : {}
      }
    });
  }

  // ----------------------------
  // CSV import/export
  // ----------------------------
  async function exportCSV() {
    if (!profiles.length) {
      alert("No profiles to export!");
      return;
    }

    if (isServerConfigured()) {
      try {
        const r = await fetch(API_BASE + "/api/djs/export.csv", { headers: authHeaders() });
        if (!r.ok) throw new Error("Export failed");

        const blob = await r.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `dj-profiles-export-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      } catch (_e) {
        alert("Server export failed. Falling back to local export.");
      }
    }

    // Local export
    const csvData = profiles.map((p) => ({
      "Stage Name": p.stageName,
      "Name (First & Last)": p.fullName,
      City: p.city || "",
      State: p.state || "",
      "Phone Number": p.phoneNumber || "",
      "Experience Level": p.experienceLevel || "",
      Age: p.age,
      Email: p.email,
      "Social Media Links": p.socialMedia || "",
      "How did you hear about us?": p.heardAbout || ""
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `dj-profiles-${Date.now()}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function importCSV(file) {
    if (!file) return;

    if (isServerConfigured()) {
      try {
        const fd = new FormData();
        fd.append("file", file);

        const r = await fetch(API_BASE + "/api/djs/import", {
          method: "POST",
          headers: authHeaders(),
          body: fd
        });

        if (!r.ok) {
          const msg = await r.text();
          throw new Error(msg || "Import failed");
        }

        await loadProfiles();
        applyFilters();
        updateCharts();
        alert("Import complete (server upsert).");
        return;
      } catch (_e) {
        alert("Server import failed. Falling back to local import.");
      }
    }

    // Local import (flexible column mapping)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        if (!results.data.length) {
          alert("CSV file is empty!");
          return;
        }

        const imported = results.data
          .filter((row) => {
            const stageName = row["Stage Name:"] || row["Stage Name"] || row.stageName || "";
            return stageName.trim() !== "";
          })
          .map((row) => ({
            id: Date.now().toString() + "-" + Math.random().toString(36).slice(2),
            stageName: (row["Stage Name:"] || row["Stage Name"] || row.stageName || "").trim(),
            fullName: (row["Name (First & Last):"] || row["Name (First & Last)"] || row.fullName || "").trim(),
            city: (row["City"] || row.city || "").trim(),
            state: (row["State"] || row.state || "").trim(),
            phoneNumber: (row["Phone Number"] || row.phoneNumber || "").trim(),
            experienceLevel: (row["Experience Level:"] || row["Experience Level"] || row.experienceLevel || "").trim(),
            age: (row["Age"] || row.age || "").trim(),
            email: (row["Email:"] || row["Email"] || row.email || "").trim(),
            socialMedia: (row["Social Media Links:"] || row["Social Media Links"] || row.socialMedia || "").trim(),
            heardAbout: (row["How did you hear about us?"] || row.heardAbout || "").trim()
          }));

        if (!imported.length) {
          alert("No valid DJ profiles found in CSV.");
          return;
        }

        const existingMap = new Map();
        profiles.forEach((p) => {
          existingMap.set(((p.stageName || "") + "|" + (p.email || "")).toLowerCase(), p);
        });
        imported.forEach((p) => {
          const key = (p.stageName + "|" + p.email).toLowerCase();
          existingMap.set(key, p);
        });

        profiles = Array.from(existingMap.values());
        saveToLocalStorage();
        updateCountLabel();
        applyFilters();
        updateCharts();

        alert(`Imported ${imported.length} profile(s) locally.`);
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

    document.addEventListener("click", () => {
      navDropdown.classList.remove("active");
    });

    navDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // ----------------------------
  // Wiring
  // ----------------------------
  function wireUI() {
    $("apiBase").value = API_BASE;
    $("adminToken").value = ADMIN_TOKEN;

    $("btnSaveConnect").addEventListener("click", saveServerSettings);

    $("btnCreate").addEventListener("click", openCreateModal);
    $("btnExport").addEventListener("click", exportCSV);
    $("btnImport").addEventListener("click", () => $("csvImport").click());

    $("csvImport").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      await importCSV(f);
      e.target.value = "";
    });

    $("searchInput").addEventListener("input", applyFilters);
    $("sortBy").addEventListener("change", applyFilters);
    $("displayCount").addEventListener("change", applyFilters);
    $("cardSize").addEventListener("change", () => {
      updateCardSize();
      applyFilters();
    });

    $("toggleAnalyticsBtn").addEventListener("click", toggleAnalytics);

    ["showExperience", "showAge", "showLocation", "showReferral"].forEach((id) => {
      $(id).addEventListener("change", updateChartVisibility);
    });

    $("modalClose").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);
    $("profileForm").addEventListener("submit", saveProfile);

    // click backdrop to close
    $("profileModal").addEventListener("click", (e) => {
      if (e.target && e.target.id === "profileModal") closeModal();
    });
  }

  window.addEventListener("DOMContentLoaded", async () => {
    wireUI();
    setupNavigation();

    await checkServerHealth();
    await loadProfiles();
    updateCardSize();
    applyFilters();
    updateChartVisibility();
    updateCharts();
  });
})();
