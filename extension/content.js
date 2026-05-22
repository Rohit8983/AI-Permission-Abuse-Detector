// content.js — Strict Trusted Types safe (YouTube/Gmail/Google compatible)
// NO innerHTML, NO cssText, NO insertAdjacentHTML — pure DOM only

(function () {
  "use strict";

  if (window.__aiPermHooked) return;
  window.__aiPermHooked = true;
  window.__aiPermDetectorLoaded = true;

  const intercepted = new Set();
  const _chrome = (typeof browser !== "undefined") ? browser : chrome;

  // ── Risk Analysis ──────────────────────────────────────────────────────────
  function analyzeRisk(permission) {
    const combined = (location.href + " " + document.title).toLowerCase();

    let category = "unknown";
    const cats = [
      ["video_conference", ["zoom.us", "meet.google", "teams.microsoft", "webex", "jitsi", "whereby.com", "skype"]],
      ["camera_test",      ["webcamtest", "webcam-test", "camtest", "webcamtests", "mic-test"]],
      ["social_media",     ["facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com", "tiktok.com", "reddit.com", "discord.com"]],
      ["e_commerce",       ["amazon.", "ebay.", "shopify", "etsy.", "flipkart", "/cart", "/checkout"]],
      ["banking",          ["bank", "chase.com", "paypal.com", "stripe.com", "finance", "invest", "credit", "loan"]],
      ["news",             ["bbc.", "cnn.", "nytimes.", "theguardian", "reuters.", "/news/", "breaking"]],
      ["education",        [".edu", "coursera.", "udemy.", "khanacademy.", "edx.", "university", "college"]],
      ["entertainment",    ["youtube.com", "netflix.", "spotify.", "twitch.", "hulu.", "primevideo", "hotstar", "gaming"]],
      ["health",           ["webmd.", "mayoclinic.", "/health/", "medical", "hospital", "clinic", "pharmacy"]],
      ["blog",             ["medium.com", "wordpress.", "substack.", "ghost.io", "blogger."]],
      ["search",           ["google.com/search", "bing.com/search", "duckduckgo.com", "yahoo.com/search"]],
    ];
    for (const [cat, terms] of cats) {
      if (terms.some(t => combined.includes(t))) { category = cat; break; }
    }

    const matrix = {
      "camera":          { video_conference:"low", social_media:"low", camera_test:"low", education:"low", entertainment:"low", e_commerce:"high", banking:"high", news:"critical", blog:"critical", search:"high", health:"medium", unknown:"medium" },
      "microphone":      { video_conference:"low", social_media:"low", camera_test:"low", education:"low", entertainment:"low", e_commerce:"high", banking:"high", news:"critical", blog:"critical", search:"low",  health:"medium", unknown:"medium" },
      "geolocation":     { e_commerce:"low", social_media:"low", entertainment:"low", search:"low", health:"low", camera_test:"low", news:"medium", banking:"medium", education:"medium", video_conference:"medium", blog:"high", unknown:"medium" },
      "clipboard-read":  { banking:"critical", blog:"critical", e_commerce:"high", news:"high", unknown:"high", video_conference:"medium", social_media:"medium", education:"low", search:"medium", entertainment:"medium", health:"medium", camera_test:"low" },
      "clipboard-write": { video_conference:"low", e_commerce:"low", search:"low", social_media:"low", education:"low", entertainment:"low", health:"low", camera_test:"low", news:"medium", blog:"medium", banking:"medium", unknown:"medium" },
      "notifications":   { social_media:"low", e_commerce:"low", news:"low", entertainment:"low", education:"low", search:"low", health:"low", camera_test:"low", video_conference:"low", banking:"medium", blog:"medium", unknown:"medium" },
    };

    const riskLevel = matrix[permission]?.[category] ?? "medium";
    const label     = fmtPerm(permission);
    const catLabel  = category.replace(/_/g, " ");
    const domain    = location.hostname.replace("www.", "");

    const explanations = {
      critical: "\u26D4 " + domain + " is a " + catLabel + " site. Requesting " + label + " is almost never legitimate here and may indicate surveillance or data theft.",
      high:     "\u26A0 " + label + " is unusual for a " + catLabel + " site. This could be an attempt to collect your data without consent.",
      medium:   label + " requested on " + domain + ". Somewhat unexpected for a " + catLabel + " site \u2014 verify you trust it before allowing.",
      low:      label + " is expected for this type of site (" + catLabel + "). This appears to be a legitimate request.",
    };

    return { category, riskLevel, explanation: explanations[riskLevel] };
  }

  // ── Style helper — sets ONE property at a time (no cssText) ───────────────
  function css(el, props) {
    for (const [k, v] of Object.entries(props)) {
      el.style.setProperty(
        k.replace(/([A-Z])/g, "-$1").toLowerCase(),
        v
      );
    }
  }

  // ── Banner — zero innerHTML, zero cssText, zero Object.assign on style ────
  function showBanner(permission, analysis) {
    const old = document.getElementById("__aipd_banner");
    if (old && old.parentNode) old.parentNode.removeChild(old);

    const pal = {
      low:      { border: "#22c55e", bg: "#052e16", icon: "\u2705" },
      medium:   { border: "#f59e0b", bg: "#1c1200", icon: "\u26A1" },
      high:     { border: "#ef4444", bg: "#1c0000", icon: "\u26A0" },
      critical: { border: "#a855f7", bg: "#170a2e", icon: "\uD83D\uDEA8" },
    }[analysis.riskLevel] || { border: "#ef4444", bg: "#1c0000", icon: "\u26A0" };

    // ── Banner root ──
    const banner = document.createElement("div");
    banner.setAttribute("id", "__aipd_banner");
    css(banner, {
      position:     "fixed",
      top:          "0",
      left:         "0",
      right:        "0",
      zIndex:       "2147483647",
      background:   pal.bg,
      borderBottom: "3px solid " + pal.border,
      fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      boxShadow:    "0 4px 24px rgba(0,0,0,0.75)",
      boxSizing:    "border-box",
    });

    // ── Inner row ──
    const row = document.createElement("div");
    css(row, {
      display:    "flex",
      alignItems: "center",
      gap:        "10px",
      padding:    "10px 16px",
      boxSizing:  "border-box",
      flexWrap:   "nowrap",
    });

    // ── Icon ──
    const iconEl = document.createElement("span");
    iconEl.textContent = pal.icon;
    css(iconEl, { fontSize: "18px", flexShrink: "0" });

    // ── Risk badge ──
    const badge = document.createElement("span");
    badge.textContent = analysis.riskLevel.toUpperCase() + " RISK";
    css(badge, {
      background:    pal.border + "28",
      border:        "1.5px solid " + pal.border,
      color:         pal.border,
      padding:       "2px 8px",
      borderRadius:  "4px",
      fontSize:      "9px",
      fontWeight:    "800",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontFamily:    "monospace",
      flexShrink:    "0",
      whiteSpace:    "nowrap",
    });

    // ── Text block ──
    const textBlock = document.createElement("div");
    css(textBlock, { flex: "1", minWidth: "0", overflow: "hidden" });

    // Title — built with text nodes only
    const titleEl = document.createElement("div");
    css(titleEl, {
      color:         "#f5f5f5",
      fontWeight:    "700",
      fontSize:      "12px",
      marginBottom:  "2px",
      whiteSpace:    "nowrap",
      overflow:      "hidden",
      textOverflow:  "ellipsis",
    });
    const t1 = document.createTextNode("\uD83D\uDEE1 AI Permission Detector \u00B7 ");
    const strong = document.createElement("strong");
    strong.textContent = fmtPerm(permission);
    css(strong, { color: pal.border });
    const t2 = document.createTextNode(" requested on " + location.hostname.replace("www.", ""));
    titleEl.appendChild(t1);
    titleEl.appendChild(strong);
    titleEl.appendChild(t2);

    // Explanation
    const expEl = document.createElement("div");
    expEl.textContent = analysis.explanation;
    css(expEl, {
      color:        "#bbbbbb",
      fontSize:     "11px",
      overflow:     "hidden",
      textOverflow: "ellipsis",
      whiteSpace:   "nowrap",
    });

    textBlock.appendChild(titleEl);
    textBlock.appendChild(expEl);

    // ── Buttons ──
    const btnWrap = document.createElement("div");
    css(btnWrap, { display: "flex", gap: "6px", flexShrink: "0" });

    if (analysis.riskLevel !== "low") {
      const blockBtn = mkBtn("Block", pal.border + "33", pal.border, "1.5px solid " + pal.border);
      blockBtn.addEventListener("click", function () {
        // Clear title safely
        while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
        titleEl.appendChild(document.createTextNode("\uD83D\uDEAB " + fmtPerm(permission) + " blocked by AI Permission Detector"));
        expEl.textContent = "This request has been recorded as blocked.";
        if (blockBtn.parentNode) blockBtn.parentNode.removeChild(blockBtn);
        try { _chrome.runtime.sendMessage({ type: "USER_DECISION", data: { permission: permission, decision: "block", domain: location.hostname } }); } catch (e) {}
      });
      btnWrap.appendChild(blockBtn);
    }

    const allowBtn = mkBtn("Allow", "#2a2a2a", "#cccccc", "1px solid #555555");
    allowBtn.addEventListener("click", function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });
    btnWrap.appendChild(allowBtn);

    const closeBtn = mkBtn("\u00D7", "transparent", "#888888", "1px solid #333333");
    css(closeBtn, { fontSize: "15px", lineHeight: "1" });
    closeBtn.addEventListener("click", function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });
    btnWrap.appendChild(closeBtn);

    // ── Assemble ──
    row.appendChild(iconEl);
    row.appendChild(badge);
    row.appendChild(textBlock);
    row.appendChild(btnWrap);
    banner.appendChild(row);

    // ── Insert at top of body ──
    const target = document.body || document.documentElement;
    if (target) {
      target.insertBefore(banner, target.firstChild);
    }

    // Auto-dismiss low risk after 5s
    if (analysis.riskLevel === "low") {
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 5000);
    }
  }

  // ── Button factory (no cssText) ───────────────────────────────────────────
  function mkBtn(label, bg, color, border) {
    const btn = document.createElement("button");
    btn.textContent = label;
    css(btn, {
      padding:       "5px 12px",
      borderRadius:  "5px",
      border:        border,
      background:    bg,
      color:         color,
      fontWeight:    "700",
      cursor:        "pointer",
      fontSize:      "11px",
      fontFamily:    "sans-serif",
      flexShrink:    "0",
      outline:       "none",
    });
    return btn;
  }

  // ── Intercept ─────────────────────────────────────────────────────────────
  function intercept(permission) {
    if (intercepted.has(permission)) return;
    intercepted.add(permission);

    const analysis = analyzeRisk(permission);
    showBanner(permission, analysis);

    try {
      _chrome.runtime.sendMessage({
        type: "PERMISSION_INTERCEPTED",
        data: {
          permission:  permission,
          url:         location.href,
          pageTitle:   document.title,
          pageKeywords:[],
          category:    analysis.category,
          riskLevel:   analysis.riskLevel,
          explanation: analysis.explanation,
          timestamp:   new Date().toISOString(),
        }
      });
    } catch (e) { /* background inactive — banner already shown */ }
  }

  // ── API Hooks ─────────────────────────────────────────────────────────────

  // getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var _gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (c) {
      if (c && c.video) intercept("camera");
      if (c && c.audio) intercept("microphone");
      return _gum.call(this, c);
    };
  }

  // Geolocation
  if (navigator.geolocation) {
    var _gcp = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function () {
      intercept("geolocation"); return _gcp.apply(this, arguments);
    };
    var _gwp = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = function () {
      intercept("geolocation"); return _gwp.apply(this, arguments);
    };
  }

  // Clipboard
  if (navigator.clipboard) {
    ["read", "readText"].forEach(function (fn) {
      if (navigator.clipboard[fn]) {
        var _o = navigator.clipboard[fn].bind(navigator.clipboard);
        navigator.clipboard[fn] = function () { intercept("clipboard-read"); return _o.apply(this, arguments); };
      }
    });
    ["write", "writeText"].forEach(function (fn) {
      if (navigator.clipboard[fn]) {
        var _o = navigator.clipboard[fn].bind(navigator.clipboard);
        navigator.clipboard[fn] = function () { intercept("clipboard-write"); return _o.apply(this, arguments); };
      }
    });
  }

  // Notification
  if (window.Notification && window.Notification.requestPermission) {
    var _nrp = window.Notification.requestPermission.bind(window.Notification);
    window.Notification.requestPermission = function () {
      intercept("notifications"); return _nrp.apply(this, arguments);
    };
  }

  // permissions.query
  if (navigator.permissions && navigator.permissions.query) {
    var _pq = navigator.permissions.query.bind(navigator.permissions);
    var skipPerms = ["accelerometer","gyroscope","magnetometer","payment-handler","periodic-background-sync","midi","storage-access","window-management"];
    navigator.permissions.query = function (d) {
      if (d && d.name && !skipPerms.includes(d.name)) intercept(d.name);
      return _pq.call(this, d);
    };
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  function fmtPerm(p) {
    var m = { camera:"Camera", microphone:"Microphone", geolocation:"Location", "clipboard-read":"Clipboard Read", "clipboard-write":"Clipboard Write", notifications:"Notifications" };
    return m[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Unknown");
  }

})();