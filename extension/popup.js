// popup.js — reads Chrome storage directly (no background dependency)
// Cross-browser: Chrome, Edge, Firefox

"use strict";

// ── Browser compat ──────────────────────────────────────────────────────────
const _br = (typeof browser !== "undefined") ? browser : chrome;

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  await loadAlerts();
  await loadSettings();
  bindEvents();
});

// ── Tabs ─────────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab)?.classList.add("active");
      if (tab.dataset.tab === "dashboard") await loadDashboard();
      if (tab.dataset.tab === "site")      await loadCurrentSite();
    });
  });
}

// ── Alerts ───────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const loader    = document.getElementById("alerts-loader");
  const container = document.getElementById("alerts-container");
  const list      = document.getElementById("alerts-list");
  const label     = document.getElementById("alerts-count-label");

  try {
    const result = await _br.storage.local.get(["alerts"]);
    const alerts = (result.alerts || []).slice().reverse();

    loader.style.display    = "none";
    container.style.display = "block";
    label.textContent       = alerts.length + " Alert" + (alerts.length !== 1 ? "s" : "") + " Detected";

    if (alerts.length === 0) {
      list.innerHTML = "";
      const empty = makeEmptyState("\uD83D\uDEE1\uFE0F", "No permission alerts yet.\nBrowse some sites and suspicious\npermission requests will appear here.");
      list.appendChild(empty);
      return;
    }

    list.innerHTML = "";
    alerts.slice(0, 50).forEach(a => list.appendChild(buildAlertCard(a)));
    bindAlertActions();

  } catch (e) {
    loader.style.display    = "none";
    container.style.display = "block";
    list.innerHTML = "";
    const err = makeEmptyState("!", "Error loading alerts:\n" + e.message);
    list.appendChild(err);
  }
}

// ── Build alert card (no innerHTML) ─────────────────────────────────────────
function buildAlertCard(a) {
  const icons = { low: "\u2713", medium: "\u26A1", high: "\u26A0", critical: "\uD83D\uDEA8" };

  const card = el("div", "alert-item risk-" + (a.riskLevel || "medium"));
  card.dataset.id = a.id || "";

  // Top row
  const top = el("div", "alert-top");
  const perm = el("span", "alert-perm");
  perm.textContent = (icons[a.riskLevel] || "\u2022") + " " + fmtPerm(a.permission);
  const badge = el("span", "risk-badge " + (a.riskLevel || "medium"));
  badge.textContent = (a.riskLevel || "medium").toUpperCase();
  const time = el("span", "alert-time");
  time.style.marginLeft = "auto";
  time.textContent = timeAgo(a.timestamp);
  top.appendChild(perm);
  top.appendChild(badge);
  top.appendChild(time);

  // Domain row
  const domain = el("div", "alert-domain");
  domain.textContent = (a.domain || extractDomain(a.url || "")) + " \u00B7 " + (a.category || "unknown").replace(/_/g, " ");

  // Explanation
  const exp = el("div", "alert-explanation");
  exp.textContent = a.explanation || "No explanation available.";

  // Flags
  const flagsWrap = el("div", "flags");
  (a.flags || []).forEach(f => {
    const tag = el("span", "flag-tag");
    tag.textContent = f.replace(/_/g, " ");
    flagsWrap.appendChild(tag);
  });

  card.appendChild(top);
  card.appendChild(domain);
  card.appendChild(exp);
  if ((a.flags || []).length) card.appendChild(flagsWrap);

  // Action buttons (not for low risk)
  if (a.riskLevel !== "low") {
    const actions = el("div", "alert-actions");

    const allowBtn = el("button", "action-btn allow");
    allowBtn.textContent = "Allow Once";
    allowBtn.dataset.id = a.id || "";
    allowBtn.dataset.domain = a.domain || "";
    allowBtn.dataset.permission = a.permission || "";
    allowBtn.dataset.action = "allow";

    const blockBtn = el("button", "action-btn block");
    blockBtn.textContent = "Block";
    blockBtn.dataset.id = a.id || "";
    blockBtn.dataset.domain = a.domain || "";
    blockBtn.dataset.permission = a.permission || "";
    blockBtn.dataset.action = "block";

    const trustBtn = el("button", "action-btn trust");
    trustBtn.textContent = "Trust Site";
    trustBtn.dataset.id = a.id || "";
    trustBtn.dataset.domain = a.domain || "";
    trustBtn.dataset.permission = a.permission || "";
    trustBtn.dataset.action = "trust_always";

    actions.appendChild(allowBtn);
    actions.appendChild(blockBtn);
    actions.appendChild(trustBtn);
    card.appendChild(actions);
  }

  return card;
}

function bindAlertActions() {
  document.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const { domain, permission, action } = btn.dataset;
      await recordDecision(domain, permission, action);
      btn.textContent = "\u2713 Saved";
      btn.disabled = true;
      btn.style.opacity = "0.5";
    });
  });
}

async function recordDecision(domain, permission, decision) {
  const r = await _br.storage.local.get(["userDecisions", "trustedSites", "blockedSites"]);
  const decisions = r.userDecisions || [];
  const trusted   = r.trustedSites  || [];
  const blocked   = r.blockedSites  || [];

  decisions.push({ id: genId(), domain, permission, decision, timestamp: new Date().toISOString() });
  if (decision === "trust_always" && !trusted.includes(domain)) trusted.push(domain);
  if (decision === "block_always" && !blocked.includes(domain)) blocked.push(domain);

  await _br.storage.local.set({ userDecisions: decisions, trustedSites: trusted, blockedSites: blocked });
}

// ── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r         = await _br.storage.local.get(["alerts", "userDecisions"]);
  const alerts    = r.alerts        || [];
  const decisions = r.userDecisions || [];
  const byRisk    = countBy(alerts, "riskLevel");
  const domains   = new Set(alerts.map(a => a.domain || extractDomain(a.url || ""))).size;
  const highCnt   = (byRisk.high || 0) + (byRisk.critical || 0);

  setText("dash-total",     alerts.length);
  setText("dash-high",      highCnt);
  setText("dash-sites",     domains);
  setText("dash-decisions", decisions.length);

  const levels = ["critical", "high", "medium", "low"];
  const max    = Math.max(...levels.map(l => byRisk[l] || 0), 1);
  levels.forEach(l => {
    const cnt = byRisk[l] || 0;
    const bar = document.getElementById("bar-" + l);
    const num = document.getElementById("cnt-" + l);
    if (bar) bar.style.width = Math.round((cnt / max) * 100) + "%";
    if (num) num.textContent = cnt;
  });

  const byPerm  = countBy(alerts, "permission");
  const sorted  = Object.entries(byPerm).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const permEl  = document.getElementById("top-permissions");
  if (permEl) {
    permEl.innerHTML = "";
    if (!sorted.length) {
      permEl.textContent = "No data yet";
    } else {
      sorted.forEach(([p, c]) => {
        const row = el("div");
        row.style.cssText = "display:flex;justify-content:space-between;margin-bottom:5px;padding:4px 0;border-bottom:1px solid var(--border)";
        const name = el("span");
        name.style.color = "var(--text)";
        name.textContent = fmtPerm(p);
        const cnt = el("span");
        cnt.style.cssText = "color:var(--accent);font-weight:700";
        cnt.textContent = c;
        row.appendChild(name);
        row.appendChild(cnt);
        permEl.appendChild(row);
      });
    }
  }
}

// ── Current Site ─────────────────────────────────────────────────────────────
async function loadCurrentSite() {
  const container = document.getElementById("site-content");
  container.innerHTML = "";

  try {
    const tabs = await _br.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs[0];

    if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:") || tab.url.startsWith("moz-extension://")) {
      container.appendChild(makeEmptyState("", "Open a website to see site details."));
      return;
    }

    const domain = extractDomain(tab.url);
    const r      = await _br.storage.local.get(["alerts", "userDecisions"]);
    const alerts    = (r.alerts        || []).filter(a => (a.domain || extractDomain(a.url || "")) === domain);
    const decisions = (r.userDecisions || []).filter(d => d.domain === domain);
    const byRisk    = countBy(alerts, "riskLevel");
    const highCnt   = (byRisk.high || 0) + (byRisk.critical || 0);
    const perms     = [...new Set(alerts.map(a => a.permission))];
    const category  = alerts.length ? (alerts[alerts.length - 1].category || "unknown") : "unknown";
    const riskColor = highCnt > 0 ? "high" : alerts.length > 0 ? "low" : "neutral";

    // Site card
    const card = el("div", "site-card");

    const header = el("div", "site-header");
    const fav = el("div", "site-favicon");
    fav.textContent = "\uD83C\uDF10";
    const domEl = el("div", "site-domain");
    domEl.textContent = domain;
    const catEl = el("div", "site-category");
    catEl.textContent = category.replace(/_/g, " ");
    header.appendChild(fav);
    header.appendChild(domEl);
    header.appendChild(catEl);

    const statsRow = el("div", "stats-row");
    statsRow.appendChild(makeStatBox(alerts.length, "Total",     "neutral"));
    statsRow.appendChild(makeStatBox(highCnt,        "High Risk", riskColor));
    statsRow.appendChild(makeStatBox(decisions.length,"Decisions","neutral"));

    card.appendChild(header);
    card.appendChild(statsRow);
    container.appendChild(card);

    // Permissions
    const permSection = el("div");
    permSection.style.marginTop = "10px";

    const permTitle = el("div");
    permTitle.style.cssText = "font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:6px";
    permTitle.textContent = "Permissions Requested";

    const permTags = el("div", "perm-tags");
    if (perms.length) {
      perms.forEach(p => {
        const tag = el("span", "perm-tag");
        tag.textContent = fmtPerm(p);
        permTags.appendChild(tag);
      });
    } else {
      const none = el("span");
      none.style.cssText = "color:var(--muted);font-size:11px";
      none.textContent = "None detected yet";
      permTags.appendChild(none);
    }

    permSection.appendChild(permTitle);
    permSection.appendChild(permTags);

    if (alerts.length) {
      const last = el("div");
      last.style.cssText = "font-size:10px;color:var(--muted);margin-top:10px";
      last.textContent = "Last seen: " + timeAgo(alerts[alerts.length - 1].timestamp);
      permSection.appendChild(last);
    }

    container.appendChild(permSection);

  } catch (e) {
    container.innerHTML = "";
    container.appendChild(makeEmptyState("!", "Unable to load site info:\n" + e.message));
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const r        = await _br.storage.local.get(["settings"]);
  const settings = r.settings || {};
  setCheck("set-autoblock",     settings.autoBlock      || false);
  setCheck("set-notify-high",   settings.notifyOnHigh   !== false);
  setCheck("set-notify-medium", settings.notifyOnMedium || false);
  setCheck("set-learning",      settings.enableLearning !== false);
  const urlEl = document.getElementById("set-backend-url");
  if (urlEl) urlEl.value = settings.backendUrl || "https://ai-permission-abuse-detector.onrender.com";
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById("clear-alerts-btn")?.addEventListener("click", async () => {
    if (confirm("Clear all alerts?")) {
      await _br.storage.local.set({ alerts: [] });
      await loadAlerts();
    }
  });

  document.getElementById("refresh-btn")?.addEventListener("click", async () => {
    await loadAlerts();
    if (document.getElementById("tab-dashboard")?.classList.contains("active")) await loadDashboard();
    if (document.getElementById("tab-site")?.classList.contains("active"))      await loadCurrentSite();
  });

  document.getElementById("save-settings-btn")?.addEventListener("click", async () => {
    const settings = {
      autoBlock:      getCheck("set-autoblock"),
      notifyOnHigh:   getCheck("set-notify-high"),
      notifyOnMedium: getCheck("set-notify-medium"),
      enableLearning: getCheck("set-learning"),
      backendUrl:     document.getElementById("set-backend-url")?.value?.trim() || "https://ai-permission-abuse-detector.onrender.com"
    };
    await _br.storage.local.set({ settings });
    const btn = document.getElementById("save-settings-btn");
    btn.textContent = "\u2713 Saved!";
    setTimeout(() => { btn.textContent = "Save Settings"; }, 2000);
  });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(tag, className) {
  const e = document.createElement(tag || "div");
  if (className) e.className = className;
  return e;
}

function makeEmptyState(icon, msg) {
  const wrap = el("div", "empty-state");
  if (icon) {
    const ic = el("div", "big-icon");
    ic.textContent = icon;
    wrap.appendChild(ic);
  }
  const p = el("p");
  p.textContent = msg;
  wrap.appendChild(p);
  return wrap;
}

function makeStatBox(val, label, riskClass) {
  const box = el("div", "stat-box");
  const v   = el("div", "stat-val " + riskClass);
  v.textContent = val;
  const l   = el("div", "stat-label");
  l.textContent = label;
  box.appendChild(v);
  box.appendChild(l);
  return box;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function extractDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url || "unknown"; }
}

function fmtPerm(p) {
  const m = { camera:"Camera", microphone:"Microphone", geolocation:"Location",
    "clipboard-read":"Clipboard Read", "clipboard-write":"Clipboard Write", notifications:"Notifications" };
  return m[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Unknown");
}

function timeAgo(iso) {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return d + "d ago";
  if (h > 0) return h + "h ago";
  if (m > 0) return m + "m ago";
  return "just now";
}

function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const v = item[key] || "unknown";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function setText(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}

function setCheck(id, val) {
  const e = document.getElementById(id);
  if (e) e.checked = !!val;
}

function getCheck(id) {
  return document.getElementById(id)?.checked || false;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
