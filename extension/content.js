// content.js — runs in MAIN world directly, no injection needed

(function () {
  if (window.__aiPermHooked) return;
  window.__aiPermHooked = true;
  window.__aiPermDetectorLoaded = true;

  const intercepted = new Set();

  // ── Risk Analysis ──────────────────────────────────────────────────────────
  function analyzeRisk(permission) {
    const url = location.href;
    const combined = (url + " " + document.title).toLowerCase();

    let category = "unknown";
    const cats = [
      ["video_conference", ["zoom", "meet.google", "teams.microsoft", "webex", "jitsi", "whereby", "skype"]],
      ["camera_test",      ["webcamtest", "webcam-test", "camtest", "camera-test", "mictests", "webcamtests"]],
      ["social_media",     ["facebook", "twitter", "instagram", "linkedin", "tiktok", "reddit", "discord"]],
      ["e_commerce",       ["amazon", "ebay", "shopify", "etsy", "shop", "store", "cart", "checkout"]],
      ["banking",          ["bank", "chase", "paypal", "stripe", "finance", "invest", "credit", "loan"]],
      ["news",             ["bbc", "cnn", "nytimes", "guardian", "reuters", "/news", "article", "breaking"]],
      ["education",        [".edu", "coursera", "udemy", "khanacademy", "university", "college"]],
      ["entertainment",    ["youtube", "netflix", "spotify", "twitch", "hulu", "game", "stream"]],
      ["health",           ["webmd", "mayoclinic", "health", "medical", "hospital", "clinic"]],
      ["blog",             ["blog", "wordpress", "medium.com", "substack"]],
    ];
    for (const [cat, terms] of cats) {
      if (terms.some(t => combined.includes(t))) { category = cat; break; }
    }

    const matrix = {
      camera:           { video_conference:"low", social_media:"low", camera_test:"low", education:"low", e_commerce:"high", banking:"high", news:"critical", blog:"critical", unknown:"medium" },
      microphone:       { video_conference:"low", social_media:"low", camera_test:"low", education:"low", e_commerce:"high", banking:"high", news:"critical", blog:"critical", unknown:"medium" },
      geolocation:      { e_commerce:"low", social_media:"low", news:"medium", banking:"medium", blog:"high", unknown:"medium" },
      "clipboard-read": { banking:"critical", e_commerce:"high", news:"high", blog:"critical", video_conference:"medium", unknown:"high" },
      "clipboard-write":{ video_conference:"low", e_commerce:"low", unknown:"medium" },
      notifications:    { social_media:"low", e_commerce:"low", news:"low", banking:"medium", blog:"medium", unknown:"medium" },
    };

    const riskLevel = matrix[permission]?.[category] ?? "medium";
    const expl = {
      critical: `⛔ A ${category.replace(/_/g," ")} site requested ${fmtPerm(permission)} — this is almost never legitimate and may indicate surveillance or data theft.`,
      high:     `⚠️ ${fmtPerm(permission)} is unusual for a ${category.replace(/_/g," ")} site. This could be an attempt to collect your data without consent.`,
      medium:   `${fmtPerm(permission)} was requested. Somewhat unexpected — verify you trust this site before allowing.`,
      low:      `${fmtPerm(permission)} access is expected for this type of site (${category.replace(/_/g," ")}). Appears legitimate.`,
    };
    return { category, riskLevel, explanation: expl[riskLevel] };
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  function showBanner(permission, analysis) {
    document.getElementById("__aipd_banner")?.remove();

    const p = {
      low:      { border:"#22c55e", bg:"#052e16", icon:"✅" },
      medium:   { border:"#f59e0b", bg:"#1c1200", icon:"⚡" },
      high:     { border:"#ef4444", bg:"#1c0000", icon:"⚠️" },
      critical: { border:"#a855f7", bg:"#170a2e", icon:"🚨" },
    }[analysis.riskLevel] || { border:"#ef4444", bg:"#1c0000", icon:"⚠️" };

    const b = document.createElement("div");
    b.id = "__aipd_banner";
    b.style.cssText = `
      all:initial;
      position:fixed!important;
      top:0!important;left:0!important;right:0!important;
      z-index:2147483647!important;
      background:${p.bg}!important;
      border-bottom:3px solid ${p.border}!important;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif!important;
      box-shadow:0 4px 24px rgba(0,0,0,.7)!important;
      display:block!important;
    `;

    b.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;box-sizing:border-box">
        <span style="font-size:20px;flex-shrink:0">${p.icon}</span>
        <span style="background:${p.border}22;border:1.5px solid ${p.border};color:${p.border};
          padding:2px 8px;border-radius:4px;font-size:10px;font-weight:800;
          letter-spacing:.08em;text-transform:uppercase;font-family:monospace;flex-shrink:0">
          ${analysis.riskLevel.toUpperCase()} RISK
        </span>
        <div style="flex:1;min-width:0">
          <div style="color:#f5f5f5;font-weight:700;font-size:13px;margin-bottom:2px">
            🛡️ AI Permission Detector &nbsp;·&nbsp; ${fmtPerm(permission)} requested on <strong style="color:${p.border}">${location.hostname.replace("www.","")}</strong>
          </div>
          <div style="color:#bbb;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${analysis.explanation}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${analysis.riskLevel !== "low" ? `<button id="__aipd_block" style="padding:5px 14px;border-radius:5px;border:1.5px solid ${p.border};background:${p.border}33;color:${p.border};font-weight:700;cursor:pointer;font-size:11px;font-family:sans-serif">Block</button>` : ""}
          <button id="__aipd_allow" style="padding:5px 14px;border-radius:5px;border:1px solid #555;background:#2a2a2a;color:#ccc;font-weight:700;cursor:pointer;font-size:11px;font-family:sans-serif">Allow</button>
          <button id="__aipd_close" style="padding:5px 10px;border-radius:5px;border:1px solid #333;background:none;color:#666;font-size:16px;cursor:pointer;line-height:1;font-family:sans-serif">✕</button>
        </div>
      </div>
    `;

    (document.body || document.documentElement).prepend(b);

    b.querySelector("#__aipd_close")?.addEventListener("click", () => b.remove());
    b.querySelector("#__aipd_allow")?.addEventListener("click", () => b.remove());
    b.querySelector("#__aipd_block")?.addEventListener("click", () => {
      b.innerHTML = `<div style="padding:10px 16px;color:${p.border};font-weight:700;font-family:sans-serif;display:flex;justify-content:space-between;align-items:center">
        <span>🚫 ${fmtPerm(permission)} blocked by AI Permission Detector</span>
        <button onclick="this.closest('#__aipd_banner').remove()" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px">✕</button>
      </div>`;
    });

    if (analysis.riskLevel === "low") setTimeout(() => b?.remove(), 5000);
  }

  // ── Notify background ──────────────────────────────────────────────────────
  function notifyBackground(permission) {
    try {
      chrome.runtime.sendMessage({
        type: "PERMISSION_INTERCEPTED",
        data: {
          permission,
          url: location.href,
          pageTitle: document.title,
          pageKeywords: [],
          timestamp: new Date().toISOString()
        }
      });
    } catch(e) {}
  }

  // ── Handle intercept ───────────────────────────────────────────────────────
  function intercept(permission) {
    if (intercepted.has(permission)) return;
    intercepted.add(permission);
    const analysis = analyzeRisk(permission);
    showBanner(permission, analysis);
    notifyBackground(permission);
  }

  // ── Hook getUserMedia ──────────────────────────────────────────────────────
  if (navigator.mediaDevices?.getUserMedia) {
    const _orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function(constraints) {
      if (constraints?.video) intercept("camera");
      if (constraints?.audio) intercept("microphone");
      return _orig(constraints);
    };
  }

  // ── Hook geolocation ──────────────────────────────────────────────────────
  if (navigator.geolocation) {
    const _gcp = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(...a) { intercept("geolocation"); return _gcp(...a); };
    const _gwp = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = function(...a) { intercept("geolocation"); return _gwp(...a); };
  }

  // ── Hook clipboard ─────────────────────────────────────────────────────────
  if (navigator.clipboard) {
    ["read","readText"].forEach(fn => {
      if (navigator.clipboard[fn]) {
        const _o = navigator.clipboard[fn].bind(navigator.clipboard);
        navigator.clipboard[fn] = function(...a) { intercept("clipboard-read"); return _o(...a); };
      }
    });
    if (navigator.clipboard.write) {
      const _o = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = function(...a) { intercept("clipboard-write"); return _o(...a); };
    }
  }

  // ── Hook Notification ──────────────────────────────────────────────────────
  if (window.Notification?.requestPermission) {
    const _o = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = function(...a) { intercept("notifications"); return _o(...a); };
  }

  // ── Hook permissions.query ─────────────────────────────────────────────────
  if (navigator.permissions?.query) {
    const _o = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(d) {
      if (d?.name) intercept(d.name);
      return _o(d);
    };
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  function fmtPerm(p) {
    return { camera:"Camera", microphone:"Microphone", geolocation:"Location",
      "clipboard-read":"Clipboard Read", "clipboard-write":"Clipboard Write",
      notifications:"Notifications" }[p] || p;
  }

})();