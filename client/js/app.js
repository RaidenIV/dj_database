/* global Papa, Chart */
(() => {
  const API_BASE = window.location.origin.replace(/\/$/, "");
  let ADMIN_TOKEN = (localStorage.getItem("djAdminToken") || "").trim();

  const $ = (id) => document.getElementById(id);

  // Custom confirmation modal
  function customConfirm(message, options = {}) {
    return new Promise((resolve) => {
      const modal = $("confirmModal");
      const title = $("confirmTitle");
      const messageEl = $("confirmMessage");
      const okBtn = $("confirmOk");
      const cancelBtn = $("confirmCancel");

      // Set content
      title.textContent = options.title || "Confirm Action";
      messageEl.textContent = message;
      
      // Set button styles
      okBtn.classList.remove("danger");
      if (options.danger) {
        okBtn.classList.add("danger");
      }
      
      // Set button text
      okBtn.textContent = options.okText || "Confirm";
      cancelBtn.textContent = options.cancelText || "Cancel";

      // Show modal
      modal.style.display = "flex";

      // Handle OK
      const handleOk = () => {
        cleanup();
        resolve(true);
      };

      // Handle Cancel
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      // Cleanup function
      const cleanup = () => {
        modal.style.display = "none";
        okBtn.removeEventListener("click", handleOk);
        cancelBtn.removeEventListener("click", handleCancel);
        modal.removeEventListener("click", handleBackdropClick);
      };

      // Handle backdrop click
      const handleBackdropClick = (e) => {
        if (e.target === modal) {
          handleCancel();
        }
      };

      // Add event listeners
      okBtn.addEventListener("click", handleOk);
      cancelBtn.addEventListener("click", handleCancel);
      modal.addEventListener("click", handleBackdropClick);
    });
  }

  // State normalization map
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

  function setAdminStatusLine(text) {
    const el = $("adminStatusLine");
    if (!el) return;
    el.textContent = text;
  }

  function setStatus(msg, kind) {
    const textEl = $("serverStatus");
    const dotEl = $("serverDot");
    if (textEl) textEl.textContent = msg || "";
    if (dotEl) {
      dotEl.classList.remove("conn-on", "conn-off", "conn-warn");
      if (kind === "success") dotEl.classList.add("conn-on");
      else if (kind === "warning") dotEl.classList.add("conn-warn");
      else dotEl.classList.add("conn-off");
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
        setAdminStatusLine("Unauthorized");
        if (ADMIN_TOKEN) logLine("Unauthorized (token rejected).", "red");
        else logLine("Unauthorized (token not set).", "warn");
        return false;
      }
      if (!r.ok) {
        setAdminBanner("unauthorized", "Error");
        setAdminStatusLine("Error");
        logLine("Auth check error (server responded " + r.status + ").", "warn");
        return false;
      }
      setAdminBanner("authorized", "Admin mode");
      setAdminStatusLine("Admin mode");
      logLine("Authorized (Admin mode enabled).", "ok");
      return true;
    } catch (_e) {
      setAdminBanner("unauthorized", "Offline");
      setAdminStatusLine("Offline");
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
        logLine(`CSV loaded locally: ${file.name} (${pendingCsvCount} rows). Click "Save".`, "blue");
      },
      error: (err) => {
        logLine("CSV parse failed: " + (err?.message || "unknown error"), "red");
      }
    });
  }

  async function saveCsvToServer() {
    if (!pendingCsvFile) {
      logLine('No CSV loaded. Click "Load CSV" first.', "warn");
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
  let isViewOnlyMode = false; // NEW: track if modal is in view-only mode

  function updateCountLabel() { /* removed profile count under title */ }

  function normalizePhoneDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  function formatPhone(raw) {
    const digits = normalizePhoneDigits(raw);
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return String(raw || "");
  }

  function truncate(str, max = 44) {
    const s = String(str || "");
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
  }

  function capitalizeName(name) {
    return String(name || "")
      .split(" ")
      .map(word => {
        if (!word) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  }

  // NEW: Function to check if a profile has missing required or optional data
  function hasMissingInfo(profile) {
    // Check optional fields that should ideally be filled
    const optionalFields = [
      profile.city,
      profile.state,
      profile.phoneNumber,
      profile.experienceLevel,
      profile.socialMedia,
      profile.heardAbout
    ];
    
    // Return true if any optional field is empty
    return optionalFields.some(field => !field || field.trim() === "");
  }

  // NEW: Function to format social media links (separate lines for URLs)
  function formatSocialMedia(socialStr) {
    if (!socialStr) return "";
    
    // Split by common separators and newlines
    const parts = socialStr
      .split(/[\n,;|]+/)
      .map(s => s.trim())
      .filter(Boolean);
    
    // If only one part, return as-is
    if (parts.length <= 1) {
      return escapeHtml(socialStr);
    }
    
    // URL indicators to detect links
    const urlIndicators = [
      'http://', 'https://', 'www.', 
      '.com', '.net', '.org', '.io', '.co', 
      'instagram.com', 'facebook.com', 'twitter.com', 
      'soundcloud.com', 'spotify.com', 'tiktok.com',
      'youtube.com', 'twitch.tv'
    ];
    
    // Check if a string is likely a URL
    const isLikelyURL = (str) => {
      const lower = str.toLowerCase();
      return urlIndicators.some(indicator => lower.includes(indicator));
    };
    
    // Separate URLs from regular text
    const result = [];
    let currentGroup = [];
    
    for (const part of parts) {
      if (isLikelyURL(part)) {
        // If we have accumulated non-URL text, add it first
        if (currentGroup.length > 0) {
          result.push(currentGroup.join(', '));
          currentGroup = [];
        }
        // Add URL on its own line
        result.push(part);
      } else {
        // Accumulate non-URL text
        currentGroup.push(part);
      }
    }
    
    // Add any remaining non-URL text
    if (currentGroup.length > 0) {
      result.push(currentGroup.join(', '));
    }
    
    // Join with line breaks
    return result.map(line => escapeHtml(line)).join('<br>');
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
      // Normalize states in loaded profiles
      profiles = profiles.map(p => ({
        ...p,
        state: normalizeState(p.state)
      }));
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
    isViewOnlyMode = false; // NEW
    $("modalTitle").textContent = "Create Profile";
    $("profileForm").reset();
    $("heardAboutOther").style.display = "none";
    
    // NEW: Show form controls, hide edit button
    setModalMode(false);
    
    $("profileModal").style.display = "block";
  }

  // NEW: Function to open modal in view-only mode
  function openViewModal(id) {
    currentEditId = id;
    isViewOnlyMode = true;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;

    $("modalTitle").textContent = "View Profile";
    populateModalFields(p);
    
    // Set to view-only mode
    setModalMode(true);
    
    $("profileModal").style.display = "block";
  }

  function openEditModal(id) {
    currentEditId = id;
    isViewOnlyMode = false; // NEW
    const p = profiles.find((x) => x.id === id);
    if (!p) return;

    $("modalTitle").textContent = "Update Profile";
    populateModalFields(p);
    
    // NEW: Show form controls, hide edit button
    setModalMode(false);
    
    $("profileModal").style.display = "block";
  }

  // NEW: Function to populate modal fields
  function populateModalFields(p) {
    $("stageName").value = p.stageName || "";
    $("fullName").value = p.fullName || "";
    $("city").value = p.city || "";
    $("state").value = p.state || "";
    $("phoneNumber").value = formatPhone(p.phoneNumber || "");
    $("experienceLevel").value = p.experienceLevel || "";
    $("age").value = p.age || "";
    $("email").value = p.email || "";
    $("socialMedia").value = p.socialMedia || "";
    
    // Handle heardAbout with Other option
    const heardAbout = p.heardAbout || "";
    const standardOptions = [
      "Social Media (Facebook, Instagram, or TikTok)",
      "Online Ad",
      "Referral (friend or family member)",
      "Previous Experience"
    ];
    
    if (standardOptions.includes(heardAbout)) {
      $("heardAbout").value = heardAbout;
      $("heardAboutOther").style.display = "none";
      $("heardAboutOther").value = "";
    } else if (heardAbout) {
      $("heardAbout").value = "Other";
      $("heardAboutOther").style.display = "block";
      $("heardAboutOther").value = heardAbout;
    } else {
      $("heardAbout").value = "";
      $("heardAboutOther").style.display = "none";
      $("heardAboutOther").value = "";
    }
  }

  // NEW: Function to toggle between view-only and edit mode
  function setModalMode(viewOnly) {
    const formInputs = $("profileForm").querySelectorAll("input, select");
    const saveBtn = $("btnSave");
    const cancelBtn = $("btnCancel");
    const editBtn = $("btnEdit");
    
    if (viewOnly) {
      // Disable all form inputs
      formInputs.forEach(input => input.disabled = true);
      
      // Hide Save/Cancel, show Edit button
      saveBtn.style.display = "none";
      cancelBtn.style.display = "none";
      editBtn.style.display = "inline-block";
    } else {
      // Enable all form inputs
      formInputs.forEach(input => input.disabled = false);
      
      // Show Save/Cancel, hide Edit button
      saveBtn.style.display = "inline-block";
      cancelBtn.style.display = "inline-block";
      editBtn.style.display = "none";
    }
  }

  // NEW: Function to switch from view to edit mode
  function switchToEditMode() {
    isViewOnlyMode = false;
    $("modalTitle").textContent = "Update Profile";
    setModalMode(false);
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
    
    // Handle heardAbout with Other option
    let heardAboutValue = $("heardAbout").value.trim();
    if (heardAboutValue === "Other") {
      heardAboutValue = $("heardAboutOther").value.trim();
    }

    // Confirm update if editing
    if (currentEditId) {
      const confirmed = await customConfirm(
        "Are you sure you want to update this profile?",
        { title: "Update Profile", okText: "Update", cancelText: "Cancel" }
      );
      if (!confirmed) return;
    }

    const payload = {
      stageName: $("stageName").value.trim(),
      fullName: $("fullName").value.trim(),
      city: $("city").value.trim(),
      state: normalizeState($("state").value.trim()),
      phoneNumber: phoneDigits,
      experienceLevel: $("experienceLevel").value.trim(),
      age: $("age").value.trim(),
      email: $("email").value.trim(),
      socialMedia: $("socialMedia").value.trim(),
      heardAbout: heardAboutValue
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
    const confirmed = await customConfirm(
      "This action cannot be undone. Are you sure you want to delete this profile?",
      { title: "Delete Profile", okText: "Delete", cancelText: "Cancel", danger: true }
    );
    if (!confirmed) return;

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
      // NEW: Add time created sorting options
      case "created":
        return s.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); // Newest first
      case "created-asc":
        return s.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); // Oldest first
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
        const socialDisp = p.socialMedia ? formatSocialMedia(p.socialMedia) : ""; // MODIFIED: Use new function
        const sourceDisp = p.heardAbout ? truncate(p.heardAbout, 34) : "";
        const showMissingInfo = hasMissingInfo(p); // NEW: Check for missing info

        return `
        <div class="profile-card">
          ${showMissingInfo ? '<div class="missing-info-indicator">Missing Info</div>' : ''}
          <div class="profile-info">
            <div class="stage-name">${escapeHtml(p.stageName || "")}</div>
            <div class="legal-name">${escapeHtml(capitalizeName(p.fullName || ""))}</div>
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

              <div class="profile-detail">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${escapeHtml(p.email || "")}</span>
              </div>

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

              ${p.socialMedia ? `
                <div class="profile-detail">
                  <span class="detail-label">Social:</span>
                  <span class="detail-value social-links">${socialDisp}</span>
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
    
    // MODIFIED: Double-click handler now opens view-only modal
    c.querySelectorAll(".profile-card").forEach((card) => {
      const editBtn = card.querySelector("button[data-action='edit']");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        card.addEventListener("dblclick", () => {
          openViewModal(id); // Changed from openEditModal to openViewModal
        });
      }
    });
  }

  // ----------------------------
  // Charts (unchanged)
  // ----------------------------
  let chartInstances = {};

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

  const colorPalettes = {
    default: {
      bg: [
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
      ],
      border: [
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
      ]
    },
    vibrant: {
      bg: [
        "rgba(255, 0, 110, 0.8)",
        "rgba(0, 255, 255, 0.8)",
        "rgba(255, 215, 0, 0.8)",
        "rgba(50, 205, 50, 0.8)",
        "rgba(255, 105, 180, 0.8)",
        "rgba(138, 43, 226, 0.8)",
        "rgba(255, 140, 0, 0.8)",
        "rgba(0, 191, 255, 0.8)",
        "rgba(255, 69, 0, 0.8)",
        "rgba(154, 205, 50, 0.8)"
      ],
      border: [
        "rgba(255, 0, 110, 1)",
        "rgba(0, 255, 255, 1)",
        "rgba(255, 215, 0, 1)",
        "rgba(50, 205, 50, 1)",
        "rgba(255, 105, 180, 1)",
        "rgba(138, 43, 226, 1)",
        "rgba(255, 140, 0, 1)",
        "rgba(0, 191, 255, 1)",
        "rgba(255, 69, 0, 1)",
        "rgba(154, 205, 50, 1)"
      ]
    },
    pastel: {
      bg: [
        "rgba(179, 205, 255, 0.8)",
        "rgba(179, 229, 252, 0.8)",
        "rgba(255, 204, 203, 0.8)",
        "rgba(255, 229, 180, 0.8)",
        "rgba(230, 190, 255, 0.8)",
        "rgba(255, 198, 224, 0.8)",
        "rgba(198, 246, 213, 0.8)",
        "rgba(255, 243, 176, 0.8)",
        "rgba(255, 224, 178, 0.8)",
        "rgba(209, 196, 233, 0.8)"
      ],
      border: [
        "rgba(179, 205, 255, 1)",
        "rgba(179, 229, 252, 1)",
        "rgba(255, 204, 203, 1)",
        "rgba(255, 229, 180, 1)",
        "rgba(230, 190, 255, 1)",
        "rgba(255, 198, 224, 1)",
        "rgba(198, 246, 213, 1)",
        "rgba(255, 243, 176, 1)",
        "rgba(255, 224, 178, 1)",
        "rgba(209, 196, 233, 1)"
      ]
    },
    monochrome: {
      bg: [
        "rgba(100, 100, 100, 0.8)",
        "rgba(150, 150, 150, 0.8)",
        "rgba(200, 200, 200, 0.8)",
        "rgba(75, 75, 75, 0.8)",
        "rgba(125, 125, 125, 0.8)",
        "rgba(175, 175, 175, 0.8)",
        "rgba(225, 225, 225, 0.8)",
        "rgba(50, 50, 50, 0.8)",
        "rgba(100, 100, 100, 0.8)",
        "rgba(150, 150, 150, 0.8)"
      ],
      border: [
        "rgba(100, 100, 100, 1)",
        "rgba(150, 150, 150, 1)",
        "rgba(200, 200, 200, 1)",
        "rgba(75, 75, 75, 1)",
        "rgba(125, 125, 125, 1)",
        "rgba(175, 175, 175, 1)",
        "rgba(225, 225, 225, 1)",
        "rgba(50, 50, 50, 1)",
        "rgba(100, 100, 100, 1)",
        "rgba(150, 150, 150, 1)"
      ]
    },
    warm: {
      bg: [
        "rgba(255, 99, 71, 0.8)",
        "rgba(255, 165, 0, 0.8)",
        "rgba(255, 215, 0, 0.8)",
        "rgba(255, 140, 0, 0.8)",
        "rgba(255, 69, 0, 0.8)",
        "rgba(250, 128, 114, 0.8)",
        "rgba(255, 160, 122, 0.8)",
        "rgba(255, 228, 181, 0.8)",
        "rgba(255, 218, 185, 0.8)",
        "rgba(255, 239, 213, 0.8)"
      ],
      border: [
        "rgba(255, 99, 71, 1)",
        "rgba(255, 165, 0, 1)",
        "rgba(255, 215, 0, 1)",
        "rgba(255, 140, 0, 1)",
        "rgba(255, 69, 0, 1)",
        "rgba(250, 128, 114, 1)",
        "rgba(255, 160, 122, 1)",
        "rgba(255, 228, 181, 1)",
        "rgba(255, 218, 185, 1)",
        "rgba(255, 239, 213, 1)"
      ]
    },
    cool: {
      bg: [
        "rgba(70, 130, 180, 0.8)",
        "rgba(100, 149, 237, 0.8)",
        "rgba(65, 105, 225, 0.8)",
        "rgba(0, 191, 255, 0.8)",
        "rgba(30, 144, 255, 0.8)",
        "rgba(135, 206, 250, 0.8)",
        "rgba(176, 224, 230, 0.8)",
        "rgba(95, 158, 160, 0.8)",
        "rgba(72, 209, 204, 0.8)",
        "rgba(64, 224, 208, 0.8)"
      ],
      border: [
        "rgba(70, 130, 180, 1)",
        "rgba(100, 149, 237, 1)",
        "rgba(65, 105, 225, 1)",
        "rgba(0, 191, 255, 1)",
        "rgba(30, 144, 255, 1)",
        "rgba(135, 206, 250, 1)",
        "rgba(176, 224, 230, 1)",
        "rgba(95, 158, 160, 1)",
        "rgba(72, 209, 204, 1)",
        "rgba(64, 224, 208, 1)"
      ]
    }
  };

  function getSelectedColorPalette() {
    const selector = $("colorPalette");
    const paletteName = selector ? selector.value : "default";
    return colorPalettes[paletteName] || colorPalettes.default;
  }

  function createChart(canvasId, data, type) {
    const canvas = $(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

    const labels = Object.keys(data);
    const values = Object.values(data);

    const palette = getSelectedColorPalette();
    const brightColors = palette.bg;
    const borderColors = palette.border;

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

    $("colorPalette").addEventListener("change", () => {
      updateCharts();
    });
    ["showExperience", "showAge", "showLocation", "showReferral"].forEach((id) => $(id).addEventListener("change", updateChartVisibility));

    $("modalClose").addEventListener("click", closeModal);
    $("btnCancel").addEventListener("click", closeModal);
    $("profileForm").addEventListener("submit", saveProfile);
    
    // NEW: Add Edit button handler
    $("btnEdit").addEventListener("click", switchToEditMode);

    // Phone formatting on blur
    $("phoneNumber").addEventListener("blur", () => {
      $("phoneNumber").value = formatPhone($("phoneNumber").value);
    });

    // Show/hide heardAboutOther field based on dropdown selection
    $("heardAbout").addEventListener("change", () => {
      const otherField = $("heardAboutOther");
      if ($("heardAbout").value === "Other") {
        otherField.style.display = "block";
      } else {
        otherField.style.display = "none";
        otherField.value = "";
      }
    });

    $("profileModal").addEventListener("click", (e) => {
      if (e.target && e.target.id === "profileModal") closeModal();
    });
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
