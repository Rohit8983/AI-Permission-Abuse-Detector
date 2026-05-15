// content.js — Intercepts browser permission API calls in real time

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__aiPermDetectorLoaded) return;
  window.__aiPermDetectorLoaded = true;

  // ─── Intercept navigator.permissions.query ────────────────────────────────

  const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
  if (originalQuery && navigator.permissions) {
    navigator.permissions.query = async function (descriptor) {
      interceptPermission(descriptor.name, "query");
      return originalQuery(descriptor);
    };
  }

  // ─── Intercept getUserMedia (camera + microphone) ─────────────────────────

  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (originalGetUserMedia && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async function (constraints) {
      if (constraints.video) interceptPermission("camera", "getUserMedia");
      if (constraints.audio) interceptPermission("microphone", "getUserMedia");
      return originalGetUserMedia(constraints);
    };
  }

  // ─── Intercept Geolocation ────────────────────────────────────────────────

  const originalGetCurrentPosition = navigator.geolocation?.getCurrentPosition?.bind(navigator.geolocation);
  if (originalGetCurrentPosition && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (...args) {
      interceptPermission("geolocation", "getCurrentPosition");
      return originalGetCurrentPosition(...args);
    };
  }

  const originalWatchPosition = navigator.geolocation?.watchPosition?.bind(navigator.geolocation);
  if (originalWatchPosition && navigator.geolocation) {
    navigator.geolocation.watchPosition = function (...args) {
      interceptPermission("geolocation", "watchPosition");
      return originalWatchPosition(...args);
    };
  }

  // ─── Intercept Clipboard ──────────────────────────────────────────────────

  const originalClipboardRead = navigator.clipboard?.read?.bind(navigator.clipboard);
  if (originalClipboardRead && navigator.clipboard) {
    navigator.clipboard.read = async function (...args) {
      interceptPermission("clipboard-read", "clipboard.read");
      return originalClipboardRead(...args);
    };
  }

  const originalClipboardReadText = navigator.clipboard?.readText?.bind(navigator.clipboard);
  if (originalClipboardReadText && navigator.clipboard) {
    navigator.clipboard.readText = async function (...args) {
      interceptPermission("clipboard-read", "clipboard.readText");
      return originalClipboardReadText(...args);
    };
  }

  const originalClipboardWrite = navigator.clipboard?.write?.bind(navigator.clipboard);
  if (originalClipboardWrite && navigator.clipboard) {
    navigator.clipboard.write = async function (...args) {
      interceptPermission("clipboard-write", "clipboard.write");
      return originalClipboardWrite(...args);
    };
  }

  // ─── Intercept Notifications ──────────────────────────────────────────────

  const OriginalNotification = window.Notification;
  if (OriginalNotification && OriginalNotification.requestPermission) {
    const originalRequestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
    OriginalNotification.requestPermission = async function (...args) {
      interceptPermission("notifications", "Notification.requestPermission");
      return originalRequestPermission(...args);
    };
  }

  // ─── Core Interception Function ───────────────────────────────────────────

  const intercepted = new Set(); // Deduplicate per session

  async function interceptPermission(permission, method) {
    const key = `${permission}-${method}`;
    if (intercepted.has(key)) return;
    intercepted.add(key);

    const data = {
      permission,
      method,
      url: window.location.href,
      pageTitle: document.title,
      pageKeywords: extractKeywords(),
      metaDescription: getMeta("description"),
      metaKeywords: getMeta("keywords"),
      timestamp: new Date().toISOString()
    };

    // Send to background for analysis
    try {
      const response = await chrome.runtime.sendMessage({
        type: "PERMISSION_INTERCEPTED",
        data
      });

      if (response && (response.riskLevel === "high" || response.riskLevel === "critical")) {
        injectWarningBanner(permission, response);
      }
    } catch (e) {
      // Extension context invalidated (page navigating), ignore
    }
  }

  // ─── Warning Banner Injection ─────────────────────────────────────────────

  function injectWarningBanner(permission, analysis) {
    if (document.getElementById("aipd-warning-banner")) return;

    const banner = document.createElement("div");
    banner.id = "aipd-warning-banner";
    banner.setAttribute("style", `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: ${analysis.riskLevel === "critical" ? "#1a0a2e" : "#1c1917"};
      border-bottom: 3px solid ${analysis.riskLevel === "critical" ? "#7c3aed" : "#ef4444"};
      color: #fafaf9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      padding: 0;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `);

    const riskEmojis = { high: "⚠️", critical: "🚨", medium: "⚡" };
    const riskColors = { high: "#ef4444", critical: "#7c3aed", medium: "#f59e0b" };
    const color = riskColors[analysis.riskLevel] || "#ef4444";

    banner.innerHTML = `
      <style>
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #aipd-warning-banner * { box-sizing: border-box; }
        #aipd-banner-inner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; max-width: 100%; }
        #aipd-badge { background: ${color}22; border: 1px solid ${color}; color: ${color}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; white-space: nowrap; flex-shrink: 0; }
        #aipd-icon { font-size: 20px; flex-shrink: 0; }
        #aipd-text { flex: 1; min-width: 0; }
        #aipd-title { font-weight: 700; color: #fafaf9; margin-bottom: 2px; }
        #aipd-desc { color: #a8a29e; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #aipd-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .aipd-btn { padding: 6px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
        .aipd-btn:hover { opacity: 0.85; }
        #aipd-btn-details { background: #292524; color: #e7e5e4; }
        #aipd-btn-dismiss { background: ${color}; color: white; }
        #aipd-close { background: none; border: none; color: #78716c; cursor: pointer; font-size: 18px; padding: 0 4px; line-height: 1; margin-left: 4px; }
      </style>
      <div id="aipd-banner-inner">
        <div id="aipd-icon">${riskEmojis[analysis.riskLevel] || "⚠️"}</div>
        <div id="aipd-badge">${analysis.riskLevel.toUpperCase()} RISK</div>
        <div id="aipd-text">
          <div id="aipd-title">Permission Abuse Detected: ${formatPermName(permission)}</div>
          <div id="aipd-desc">${analysis.explanation || "This permission request may be suspicious for this site type."}</div>
        </div>
        <div id="aipd-actions">
          <button class="aipd-btn" id="aipd-btn-details">View Analysis</button>
          <button class="aipd-btn" id="aipd-btn-dismiss">Dismiss</button>
        </div>
        <button id="aipd-close">✕</button>
      </div>
    `;

    document.documentElement.insertBefore(banner, document.documentElement.firstChild);

    document.getElementById("aipd-close")?.addEventListener("click", () => banner.remove());
    document.getElementById("aipd-btn-dismiss")?.addEventListener("click", () => banner.remove());
    document.getElementById("aipd-btn-details")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_POPUP" }).catch(() => {});
      banner.remove();
    });

    // Auto-dismiss low urgency after 8s
    if (analysis.riskLevel !== "critical") {
      setTimeout(() => banner.remove(), 8000);
    }
  }

  // ─── Page Metadata Extraction ─────────────────────────────────────────────

  function extractKeywords() {
    const words = new Set();

    // From URL path
    const pathWords = window.location.pathname.split(/[/\-_]/).filter(w => w.length > 2);
    pathWords.forEach(w => words.add(w.toLowerCase()));

    // From title
    const titleWords = document.title.split(/\s+/).filter(w => w.length > 3);
    titleWords.forEach(w => words.add(w.toLowerCase()));

    // From h1/h2
    document.querySelectorAll("h1, h2").forEach(el => {
      el.textContent.split(/\s+/).filter(w => w.length > 3).forEach(w => words.add(w.toLowerCase()));
    });

    return [...words].slice(0, 30);
  }

  function getMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
  }

  function formatPermName(perm) {
    const names = {
      camera: "Camera",
      microphone: "Microphone",
      geolocation: "Location",
      "clipboard-read": "Clipboard Read",
      "clipboard-write": "Clipboard Write",
      notifications: "Notifications"
    };
    return names[perm] || perm;
  }

})();
