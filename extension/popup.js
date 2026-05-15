// popup.js — AI Permission Detector Popup Controller

document.addEventListener("DOMContentLoaded", async () => {
  await initTabs();
  await loadAlerts();
  await loadCurrentSite();
  await loadSettings();
  bindEvents();
});

// ─── Tab Navigation ───────────────────────────────────────────────────────────

async function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panelId = `tab-${tab.dataset.tab}`;
      document.getElementById(panelId)?.classList.add("active");

      if (tab.dataset.tab === "dashboard") await loadDashboard();
      if (tab.dataset.tab === "site") await loadCurrentSite();
    });
  });
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

async function loadAlerts() {
  const loader = document.getElementById("alerts-loader");
  const container = document.getElementById("alerts-container");
  const list = document.getElementById("alerts-list");
  const countLabel = document.getElementById("alerts-count-label");

  try {
    const alerts = await sendMessage({ type: "GET_ALL_ALERTS" }) || [];

    loader.style.display = "none";
    container.style.display = "block";

    countLabel.textContent = `${alerts.length} Alert${alerts.length !== 1 ? "s" : ""} Detected`;

    if (alerts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="big-icon">🛡️</div>
          <p>No permission alerts yet.<br>Browse some sites and any suspicious<br>permission requests will appear here.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = alerts.slice(0, 50).map(alert => renderAlertItem(alert)).join("");
    bindAlertActions();
  } catch (e) {
    loader.style.display = "none";
    container.style.display = "block";
    list.innerHTML = `<div class="empty-state"><p>Error loading alerts</p></div>`;
  }
}

function renderAlertItem(alert) {
  const timeAgo = formatTimeAgo(alert.timestamp);
  const flags = (alert.flags || []).map(f => `<span class="flag-tag">${f.replace(/_/g, " ")}</span>`).join("");
  const riskIcon = { low: "✓", medium: "⚡", high: "⚠", critical: "🚨" }[alert.riskLevel] || "•";

  return `
    <div class="alert-item risk-${alert.riskLevel}" data-id="${alert.id}" data-domain="${alert.domain}" data-permission="${alert.permission}">
      <div class="alert-top">
        <span class="alert-perm">${riskIcon} ${formatPermName(alert.permission)}</span>
        <span class="risk-badge ${alert.riskLevel}">${alert.riskLevel}</span>
        <span class="alert-time">${timeAgo}</span>
      </div>
      <div class="alert-domain">${alert.domain} • ${(alert.category || "unknown").replace(/_/g, " ")}</div>
      <div class="alert-explanation">${alert.explanation || "No explanation available."}</div>
      ${flags ? `<div class="flags">${flags}</div>` : ""}
      ${alert.riskLevel !== "low" ? `
      <div class="alert-actions">
        <button class="action-btn allow" data-id="${alert.id}" data-domain="${alert.domain}" data-permission="${alert.permission}" data-action="allow">Allow Once</button>
        <button class="action-btn block" data-id="${alert.id}" data-domain="${alert.domain}" data-permission="${alert.permission}" data-action="block">Block</button>
        <button class="action-btn trust" data-id="${alert.id}" data-domain="${alert.domain}" data-permission="${alert.permission}" data-action="trust_always">Trust Site</button>
      </div>
      ` : ""}
    </div>
  `;
}

function bindAlertActions() {
  document.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { id, domain, permission, action } = btn.dataset;
      await sendMessage({
        type: "USER_DECISION",
        data: { alertId: id, domain, permission, decision: action }
      });
      btn.textContent = "✓ Saved";
      btn.disabled = true;
      btn.style.opacity = "0.5";
    });
  });
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────

async function loadDashboard() {
  const alerts = await sendMessage({ type: "GET_ALL_ALERTS" }) || [];
  const decisions = await getDecisions();

  const total = alerts.length;
  const byRisk = countBy(alerts, "riskLevel");
  const domains = new Set(alerts.map(a => a.domain)).size;
  const highCount = (byRisk.high || 0) + (byRisk.critical || 0);

  setText("dash-total", total);
  setText("dash-high", highCount);
  setText("dash-sites", domains);
  setText("dash-decisions", decisions);

  // Risk bars
  const levels = ["critical", "high", "medium", "low"];
  const max = Math.max(...levels.map(l => byRisk[l] || 0), 1);
  levels.forEach(level => {
    const count = byRisk[level] || 0;
    const pct = Math.round((count / max) * 100);
    const bar = document.getElementById(`bar-${level}`);
    const cnt = document.getElementById(`cnt-${level}`);
    if (bar) bar.style.width = `${pct}%`;
    if (cnt) cnt.textContent = count;
  });

  // Top permissions
  const byPerm = countBy(alerts, "permission");
  const sorted = Object.entries(byPerm).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topPermsEl = document.getElementById("top-permissions");
  if (topPermsEl) {
    if (sorted.length === 0) {
      topPermsEl.textContent = "No data yet";
    } else {
      topPermsEl.innerHTML = sorted.map(([perm, cnt]) => `
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;padding:4px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text)">${formatPermName(perm)}</span>
          <span style="color:var(--accent);font-weight:700">${cnt}</span>
        </div>
      `).join("");
    }
  }
}

async function getDecisions() {
  const result = await chrome.storage.local.get(["userDecisions"]);
  return (result.userDecisions || []).length;
}

// ─── Current Site Panel ───────────────────────────────────────────────────────

async function loadCurrentSite() {
  const container = document.getElementById("site-content");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      container.innerHTML = `<div class="empty-state"><p>No active tab</p></div>`;
      return;
    }

    const url = tab.url;
    const domain = extractDomain(url);
    const stats = await sendMessage({ type: "GET_SITE_STATS", url });

    const riskClass = getRiskClass(stats?.riskBreakdown);
    const permsHtml = (stats?.permissionsRequested || []).map(p =>
      `<span style="display:inline-block;background:#1a1a24;border:1px solid #2a2a38;padding:2px 7px;border-radius:4px;font-size:10px;margin:2px;color:#a0a0b8">${formatPermName(p)}</span>`
    ).join("") || '<span style="color:var(--muted);font-size:11px">None detected</span>';

    container.innerHTML = `
      <div class="site-card">
        <div class="site-header">
          <div class="site-favicon">🌐</div>
          <div class="site-domain">${domain}</div>
          <div class="site-category">${(stats?.category || "unknown").replace(/_/g, " ")}</div>
        </div>
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-val neutral">${stats?.totalAlerts || 0}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat-box">
            <div class="stat-val ${riskClass}">${(stats?.riskBreakdown?.high || 0) + (stats?.riskBreakdown?.critical || 0)}</div>
            <div class="stat-label">High Risk</div>
          </div>
          <div class="stat-box">
            <div class="stat-val neutral">${stats?.userDecisions || 0}</div>
            <div class="stat-label">Decisions</div>
          </div>
        </div>
      </div>

      <div style="padding:0 12px 12px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;font-weight:700">Permissions Requested</div>
        <div>${permsHtml}</div>

        ${stats?.lastSeen ? `<div style="font-size:10px;color:var(--muted);margin-top:10px">Last seen: ${formatTimeAgo(stats.lastSeen)}</div>` : ""}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Unable to load site info</p></div>`;
  }
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

async function loadSettings() {
  const settings = await sendMessage({ type: "GET_SETTINGS" });
  if (!settings) return;

  setCheck("set-autoblock", settings.autoBlock);
  setCheck("set-notify-high", settings.notifyOnHigh !== false);
  setCheck("set-notify-medium", settings.notifyOnMedium);
  setCheck("set-learning", settings.enableLearning !== false);

  const urlInput = document.getElementById("set-backend-url");
  if (urlInput) urlInput.value = settings.backendUrl || "http://localhost:8000";
}

function bindEvents() {
  document.getElementById("clear-alerts-btn")?.addEventListener("click", async () => {
    if (confirm("Clear all alerts?")) {
      await sendMessage({ type: "CLEAR_ALERTS" });
      await loadAlerts();
    }
  });

  document.getElementById("refresh-btn")?.addEventListener("click", async () => {
    await loadAlerts();
  });

  document.getElementById("save-settings-btn")?.addEventListener("click", async () => {
    const settings = {
      autoBlock: getCheck("set-autoblock"),
      notifyOnHigh: getCheck("set-notify-high"),
      notifyOnMedium: getCheck("set-notify-medium"),
      enableLearning: getCheck("set-learning"),
      backendUrl: document.getElementById("set-backend-url")?.value?.trim() || "http://localhost:8000"
    };

    await sendMessage({ type: "SAVE_SETTINGS", settings });
    const btn = document.getElementById("save-settings-btn");
    btn.textContent = "✓ Saved!";
    setTimeout(() => { btn.textContent = "Save Settings"; }, 2000);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function formatPermName(perm) {
  const n = { camera: "Camera", microphone: "Microphone", geolocation: "Location", "clipboard-read": "Clipboard Read", "clipboard-write": "Clipboard Write", notifications: "Notifications" };
  return n[perm] || perm;
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const v = item[key] || "unknown";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function getRiskClass(breakdown) {
  if (!breakdown) return "neutral";
  if ((breakdown.critical || 0) > 0) return "critical";
  if ((breakdown.high || 0) > 0) return "high";
  if ((breakdown.medium || 0) > 0) return "medium";
  return "low";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setCheck(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function getCheck(id) {
  return document.getElementById(id)?.checked || false;
}
