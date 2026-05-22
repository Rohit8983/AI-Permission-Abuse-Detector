// background.js — Cross-browser service worker
// Works on Chrome, Edge. Firefox uses its own event pages with polyfill.

const BACKEND_URL = "https://ai-permission-abuse-detector.onrender.com";

// ── Browser compat ─────────────────────────────────────────────────────────
const _chrome = (typeof browser !== "undefined") ? browser : chrome;

// ── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;

  if (type === "PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (type === "PERMISSION_INTERCEPTED") {
    handlePermission(message.data, sender.tab)
      .then(r => { try { sendResponse(r); } catch(e) {} });
    return true;
  }

  if (type === "GET_ALL_ALERTS") {
    chrome.storage.local.get(["alerts"], r => {
      const alerts = (r.alerts || []).slice().reverse();
      try { sendResponse(alerts); } catch(e) {}
    });
    return true;
  }

  if (type === "CLEAR_ALERTS") {
    chrome.storage.local.set({ alerts: [] }, () => {
      try { sendResponse({ ok: true }); } catch(e) {}
    });
    return true;
  }

  if (type === "GET_SITE_STATS") {
    getSiteStats(message.url).then(r => { try { sendResponse(r); } catch(e) {} });
    return true;
  }

  if (type === "GET_SETTINGS") {
    chrome.storage.local.get(["settings"], r => {
      try { sendResponse(r.settings || defaultSettings()); } catch(e) {}
    });
    return true;
  }

  if (type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ settings: message.settings }, () => {
      try { sendResponse({ ok: true }); } catch(e) {}
    });
    return true;
  }

  if (type === "USER_DECISION") {
    handleDecision(message.data).then(r => { try { sendResponse(r); } catch(e) {} });
    return true;
  }
});

// ── Permission Handler ──────────────────────────────────────────────────────
async function handlePermission(data, tab) {
  if (!data) return {};
  const domain = extractDomain(data.url || "");

  const alert = {
    id:          genId(),
    domain:      domain,
    url:         data.url || "",
    permission:  data.permission || "unknown",
    category:    data.category   || "unknown",
    riskLevel:   data.riskLevel  || "medium",
    explanation: data.explanation || "",
    flags:       data.flags || [],
    timestamp:   data.timestamp || new Date().toISOString()
  };

  // Try to enhance with backend (non-blocking)
  try {
    const res = await fetch(BACKEND_URL + "/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        permission:   data.permission,
        url:          data.url,
        pageTitle:    data.pageTitle || "",
        pageKeywords: data.pageKeywords || []
      }),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const ai = await res.json();
      alert.category    = ai.category    || alert.category;
      alert.riskLevel   = ai.riskLevel   || alert.riskLevel;
      alert.explanation = ai.explanation || alert.explanation;
      alert.flags       = ai.flags       || alert.flags;
      alert.source      = "ai";
    }
  } catch (e) {
    alert.source = "local";
  }

  // Store alert
  await storeAlert(alert);

  // Update badge
  updateBadge(alert.riskLevel, tab?.id);

  // Chrome notification for high/critical
  const settings = await getSettings();
  if (
    (alert.riskLevel === "critical" || alert.riskLevel === "high") &&
    settings.notifyOnHigh !== false
  ) {
    const icons = { high: "⚠️", critical: "🚨" };
    try {
      chrome.notifications.create("aipd-" + alert.id, {
        type:    "basic",
        iconUrl: "icons/icon48.png",
        title:   (icons[alert.riskLevel] || "⚠️") + " Permission Risk: " + alert.riskLevel.toUpperCase(),
        message: alert.domain + " requested " + alert.permission + " access.\n" + (alert.explanation || "").slice(0, 100)
      });
    } catch (e) {}
  }

  return alert;
}

// ── Decision Handler ────────────────────────────────────────────────────────
async function handleDecision(data) {
  const { domain, permission, decision } = data || {};
  const r = await chrome.storage.local.get(["userDecisions", "trustedSites", "blockedSites"]);
  const decisions = r.userDecisions || [];
  const trusted   = r.trustedSites  || [];
  const blocked   = r.blockedSites  || [];

  decisions.push({ id: genId(), domain, permission, decision, timestamp: new Date().toISOString() });
  if (decision === "trust_always" && domain && !trusted.includes(domain)) trusted.push(domain);
  if (decision === "block_always" && domain && !blocked.includes(domain)) blocked.push(domain);

  await chrome.storage.local.set({ userDecisions: decisions, trustedSites: trusted, blockedSites: blocked });
  return { ok: true };
}

// ── Site Stats ──────────────────────────────────────────────────────────────
async function getSiteStats(url) {
  const domain = extractDomain(url || "");
  const r = await chrome.storage.local.get(["alerts", "userDecisions"]);
  const alerts    = (r.alerts        || []).filter(a => a.domain === domain);
  const decisions = (r.userDecisions || []).filter(d => d.domain === domain);

  return {
    domain,
    totalAlerts:          alerts.length,
    riskBreakdown:        countBy(alerts, "riskLevel"),
    permissionsRequested: [...new Set(alerts.map(a => a.permission))],
    category:             alerts.length ? (alerts[alerts.length - 1].category || "unknown") : "unknown",
    userDecisions:        decisions.length,
    lastSeen:             alerts.length ? alerts[alerts.length - 1].timestamp : null
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────
async function storeAlert(alert) {
  const r = await chrome.storage.local.get(["alerts"]);
  const alerts = r.alerts || [];
  if (alerts.length >= 500) alerts.splice(0, alerts.length - 499);
  alerts.push(alert);
  await chrome.storage.local.set({ alerts });
}

async function getSettings() {
  const r = await chrome.storage.local.get(["settings"]);
  return r.settings || defaultSettings();
}

function defaultSettings() {
  return {
    autoBlock:      false,
    notifyOnHigh:   true,
    notifyOnMedium: false,
    enableLearning: true,
    backendUrl:     BACKEND_URL
  };
}

// ── Badge ───────────────────────────────────────────────────────────────────
function updateBadge(riskLevel, tabId) {
  const colors = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", critical: "#a855f7" };
  const labels = { low: "LOW", medium: "MED", high: "HIGH", critical: "!!!" };
  try {
    chrome.action.setBadgeText({ text: labels[riskLevel] || "" });
    chrome.action.setBadgeBackgroundColor({ color: colors[riskLevel] || "#6b7280" });
  } catch (e) {}
}

// ── Utilities ────────────────────────────────────────────────────────────────
function extractDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const v = item[key] || "unknown";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}
