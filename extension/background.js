// background.js — AI Permission Abuse Detector Service Worker

const BACKEND_URL = "http://localhost:8000";
const RISK_COLORS = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#7c3aed"
};

// Permission expectation profiles per site category
const PERMISSION_PROFILES = {
  "video_conference": {
    normal: ["camera", "microphone", "notifications", "display-capture"],
    suspicious: ["geolocation", "clipboard-read"]
  },
  "social_media": {
    normal: ["notifications", "camera", "microphone"],
    suspicious: ["clipboard-read", "geolocation"]
  },
  "e_commerce": {
    normal: ["notifications", "geolocation"],
    suspicious: ["camera", "microphone", "clipboard-read"]
  },
  "banking": {
    normal: ["notifications"],
    suspicious: ["camera", "microphone", "geolocation", "clipboard-read", "clipboard-write"]
  },
  "news": {
    normal: ["notifications"],
    suspicious: ["camera", "microphone", "clipboard-read", "geolocation"]
  },
  "education": {
    normal: ["camera", "microphone", "notifications"],
    suspicious: ["clipboard-read", "geolocation"]
  },
  "entertainment": {
    normal: ["notifications", "fullscreen"],
    suspicious: ["camera", "microphone", "clipboard-read"]
  },
  "health": {
    normal: ["notifications"],
    suspicious: ["camera", "microphone", "clipboard-read"]
  },
  "blog": {
    normal: [],
    suspicious: ["camera", "microphone", "clipboard-read", "geolocation", "notifications"]
  },
  "search": {
    normal: [],
    suspicious: ["camera", "microphone", "clipboard-read"]
  },
  "unknown": {
    normal: [],
    suspicious: ["camera", "microphone", "clipboard-read", "geolocation"]
  }
};

// Risk explanation templates
const RISK_EXPLANATIONS = {
  "camera": {
    "e_commerce": "Camera access is unusual for online shopping platforms. This could indicate an attempt to capture images without your consent.",
    "news": "News websites have no legitimate reason to access your camera. This is a strong indicator of potential surveillance or misuse.",
    "banking": "Legitimate banks rarely require camera access. This could indicate a phishing site or unauthorized data collection.",
    "blog": "Blog sites never require camera access. This request is highly suspicious and may indicate malicious intent.",
    "default": "Camera access was requested by a site that doesn't typically need it. Proceed with caution."
  },
  "microphone": {
    "e_commerce": "Microphone access is not required for shopping. This may indicate unauthorized audio surveillance.",
    "news": "News sites do not need microphone access. This could be an attempt to listen to conversations near your device.",
    "banking": "Microphone access from a banking site is unusual and potentially dangerous. Verify site legitimacy.",
    "blog": "Blogs have no need for microphone access. This request strongly suggests malicious behavior.",
    "default": "Microphone access was requested unexpectedly. This site category does not typically require audio input."
  },
  "geolocation": {
    "news": "Your location data is not needed to read news articles. This may be for targeted tracking.",
    "banking": "Sharing your precise location with banking sites is risky. Legitimate banks use IP-based verification instead.",
    "blog": "Blog sites have no reason to know your physical location.",
    "default": "Location access was requested by a site that doesn't typically need it."
  },
  "clipboard-read": {
    "default": "Clipboard read access allows this site to see everything you copy — including passwords, credit card numbers, and personal messages. This is almost always unnecessary and potentially dangerous."
  },
  "notifications": {
    "banking": "Notification permissions can be abused for phishing alerts that mimic your bank.",
    "default": "Notification access allows this site to send you messages at any time. Ensure you trust this site before granting this."
  }
};

// In-memory store for active alerts and user decisions
let pendingAlerts = {};
let analysisCache = {};

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "PERMISSION_INTERCEPTED":
      handlePermissionRequest(message.data, sender.tab)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async

    case "USER_DECISION":
      handleUserDecision(message.data);
      sendResponse({ ok: true });
      return false;

    case "GET_SITE_STATS":
      getSiteStats(message.url).then(sendResponse);
      return true;

    case "GET_ALL_ALERTS":
      getAllAlerts().then(sendResponse);
      return true;

    case "CLEAR_ALERTS":
      clearAlerts().then(sendResponse);
      return true;

    case "GET_SETTINGS":
      getSettings().then(sendResponse);
      return true;

    case "SAVE_SETTINGS":
      saveSettings(message.settings).then(sendResponse);
      return true;
  }
});

// ─── Core Permission Handler ──────────────────────────────────────────────────

async function handlePermissionRequest(data, tab) {
  const { permission, url, pageTitle, pageKeywords, domainAge } = data;
  const domain = extractDomain(url);

  // Check cache first
  const cacheKey = `${domain}-${permission}`;
  if (analysisCache[cacheKey] && Date.now() - analysisCache[cacheKey].timestamp < 300000) {
    const cached = analysisCache[cacheKey];
    await storeAlert({ ...cached, url, tab });
    return cached;
  }

  let analysis;
  try {
    // Try AI backend first
    analysis = await analyzeWithBackend(data);
  } catch (e) {
    // Fallback to local rule-based engine
    analysis = localAnalysisEngine(data);
  }

  // Cache result
  analysisCache[cacheKey] = { ...analysis, timestamp: Date.now() };

  // Store alert in history
  const alertRecord = {
    id: generateId(),
    url,
    domain,
    permission,
    pageTitle,
    timestamp: new Date().toISOString(),
    tab: tab ? { id: tab.id, title: tab.title } : null,
    ...analysis
  };

  await storeAlert(alertRecord);

  // Show notification if high risk
  if (analysis.riskLevel === "high" || analysis.riskLevel === "critical") {
    showChromeNotification(alertRecord);
  }

  // Update badge
  updateBadge(analysis.riskLevel, tab?.id);

  return analysis;
}

// ─── Backend AI Analysis ──────────────────────────────────────────────────────

async function analyzeWithBackend(data) {
  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(3000)
  });

  if (!response.ok) throw new Error("Backend error");
  return await response.json();
}

// ─── Local Fallback Analysis Engine ──────────────────────────────────────────

function localAnalysisEngine(data) {
  const { permission, url, pageTitle = "", pageKeywords = [] } = data;
  const domain = extractDomain(url);

  // Classify site category
  const category = classifySiteLocally(url, pageTitle, pageKeywords);
  const profile = PERMISSION_PROFILES[category] || PERMISSION_PROFILES["unknown"];

  let riskLevel, anomalyScore;

  if (profile.normal.includes(permission)) {
    riskLevel = "low";
    anomalyScore = 0.1;
  } else if (profile.suspicious.includes(permission)) {
    riskLevel = "high";
    anomalyScore = 0.85;
  } else {
    riskLevel = "medium";
    anomalyScore = 0.5;
  }

  // Extra bump for especially dangerous combos
  if (permission === "clipboard-read" && ["banking", "e_commerce"].includes(category)) {
    riskLevel = "critical";
    anomalyScore = 0.97;
  }

  const explanation = buildExplanation(permission, category, riskLevel, domain);
  const recommendation = riskLevel === "low" ? "allow" : riskLevel === "critical" ? "block" : "review";

  return {
    category,
    riskLevel,
    anomalyScore,
    explanation,
    recommendation,
    flags: buildFlags(permission, category, riskLevel),
    source: "local"
  };
}

function classifySiteLocally(url, pageTitle, keywords) {
  const domain = extractDomain(url).toLowerCase();
  const titleLower = (pageTitle || "").toLowerCase();
  const kw = keywords.map(k => k.toLowerCase()).join(" ");
  const combined = `${domain} ${titleLower} ${kw}`;

  const patterns = {
    "video_conference": ["zoom", "meet", "teams", "webex", "jitsi", "whereby", "skype", "video call", "conference", "meeting"],
    "social_media": ["facebook", "twitter", "instagram", "linkedin", "tiktok", "reddit", "snapchat", "social", "feed", "profile"],
    "e_commerce": ["amazon", "ebay", "shop", "store", "cart", "checkout", "buy", "product", "price", "order"],
    "banking": ["bank", "finance", "credit", "loan", "invest", "trading", "wallet", "payment", "paypal", "stripe"],
    "news": ["news", "article", "times", "post", "herald", "tribune", "breaking", "report", "press"],
    "education": ["edu", "learn", "course", "university", "school", "academy", "tutorial", "lesson", "study"],
    "entertainment": ["youtube", "netflix", "spotify", "music", "movie", "stream", "video", "game", "play", "watch"],
    "health": ["health", "medical", "doctor", "clinic", "hospital", "pharmacy", "wellness", "fitness"],
    "blog": ["blog", "wordpress", "medium", "ghost", "substack", "personal", "journal"]
  };

  let bestMatch = "unknown";
  let bestScore = 0;

  for (const [category, terms] of Object.entries(patterns)) {
    const score = terms.filter(term => combined.includes(term)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestMatch;
}

function buildExplanation(permission, category, riskLevel, domain) {
  const templates = RISK_EXPLANATIONS[permission] || {};
  const specific = templates[category] || templates["default"];

  if (specific) return specific;

  const riskWords = {
    low: "This appears to be a normal request for this type of website.",
    medium: "This permission request is somewhat unexpected for this website category.",
    high: "This permission request is unusual and potentially suspicious for this website type.",
    critical: "This permission request is a strong indicator of malicious behavior or privacy abuse."
  };

  return `${riskWords[riskLevel]} ${domain} requested ${permission} access, which is ${riskLevel === "low" ? "expected" : "not typical"} for a ${category.replace("_", " ")} site.`;
}

function buildFlags(permission, category, riskLevel) {
  const flags = [];
  if (riskLevel === "high" || riskLevel === "critical") flags.push("UNUSUAL_FOR_CATEGORY");
  if (permission === "clipboard-read" || permission === "clipboard-write") flags.push("SENSITIVE_DATA_ACCESS");
  if (permission === "camera" && !["video_conference", "social_media"].includes(category)) flags.push("POTENTIAL_SURVEILLANCE");
  if (permission === "microphone" && !["video_conference", "social_media", "education"].includes(category)) flags.push("POTENTIAL_AUDIO_CAPTURE");
  if (category === "unknown") flags.push("UNRECOGNIZED_SITE_CATEGORY");
  return flags;
}

// ─── User Decision Handler ────────────────────────────────────────────────────

async function handleUserDecision(data) {
  const { alertId, decision, domain, permission } = data;

  // Get existing decisions
  const result = await chrome.storage.local.get(["userDecisions", "trustedSites", "blockedSites"]);
  const decisions = result.userDecisions || [];
  const trusted = result.trustedSites || [];
  const blocked = result.blockedSites || [];

  // Record decision
  decisions.push({
    id: generateId(),
    alertId,
    domain,
    permission,
    decision,
    timestamp: new Date().toISOString()
  });

  // Update trust lists
  if (decision === "trust_always" && !trusted.includes(domain)) trusted.push(domain);
  if (decision === "block_always" && !blocked.includes(domain)) blocked.push(domain);

  await chrome.storage.local.set({ userDecisions: decisions, trustedSites: trusted, blockedSites: blocked });

  // Send feedback to backend (async, don't await)
  sendFeedbackToBackend({ domain, permission, decision }).catch(() => {});
}

async function sendFeedbackToBackend(data) {
  await fetch(`${BACKEND_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(2000)
  });
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function storeAlert(alert) {
  const result = await chrome.storage.local.get(["alerts"]);
  const alerts = result.alerts || [];

  // Keep only last 500 alerts
  if (alerts.length >= 500) alerts.splice(0, alerts.length - 499);
  alerts.push(alert);

  await chrome.storage.local.set({ alerts });
}

async function getAllAlerts() {
  const result = await chrome.storage.local.get(["alerts"]);
  return (result.alerts || []).reverse();
}

async function clearAlerts() {
  await chrome.storage.local.set({ alerts: [] });
  return { ok: true };
}

async function getSiteStats(url) {
  const domain = extractDomain(url);
  const result = await chrome.storage.local.get(["alerts", "userDecisions"]);
  const alerts = (result.alerts || []).filter(a => a.domain === domain);
  const decisions = (result.userDecisions || []).filter(d => d.domain === domain);

  return {
    domain,
    totalAlerts: alerts.length,
    riskBreakdown: countBy(alerts, "riskLevel"),
    permissionsRequested: [...new Set(alerts.map(a => a.permission))],
    userDecisions: decisions.length,
    lastSeen: alerts.length ? alerts[alerts.length - 1].timestamp : null
  };
}

async function getSettings() {
  const result = await chrome.storage.local.get(["settings"]);
  return result.settings || {
    autoBlock: false,
    notifyOnHigh: true,
    notifyOnMedium: false,
    backendUrl: "http://localhost:8000",
    enableLearning: true,
    showBadge: true
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  return { ok: true };
}

// ─── Notification & Badge ─────────────────────────────────────────────────────

function showChromeNotification(alert) {
  const icons = { high: "⚠️", critical: "🚨", medium: "⚡", low: "ℹ️" };
  chrome.notifications.create(`alert-${alert.id}`, {
    type: "basic",
    iconUrl: "icons/icon48.png",
    title: `${icons[alert.riskLevel]} Permission Risk Detected`,
    message: `${alert.domain} requested ${alert.permission} access.\nRisk: ${alert.riskLevel.toUpperCase()}\n${alert.explanation?.slice(0, 100)}...`,
    priority: alert.riskLevel === "critical" ? 2 : 1,
    buttons: [{ title: "View Details" }, { title: "Block" }]
  });
}

function updateBadge(riskLevel, tabId) {
  const colors = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", critical: "#7c3aed" };
  const labels = { low: "LOW", medium: "MED", high: "HIGH", critical: "!!!" };

  chrome.action.setBadgeText({ text: labels[riskLevel] || "" });
  chrome.action.setBadgeBackgroundColor({ color: colors[riskLevel] || "#6b7280" });
}

// ─── Notification Click Handler ───────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
  if (btnIndex === 0) {
    chrome.action.openPopup().catch(() => {});
  } else if (btnIndex === 1) {
    const alertId = notifId.replace("alert-", "");
    chrome.runtime.sendMessage({ type: "USER_DECISION", data: { alertId, decision: "block" } });
  }
  chrome.notifications.clear(notifId);
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key] || "unknown";
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
}
