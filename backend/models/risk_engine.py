"""
models/risk_engine.py — Permission Risk Assessment Engine
Computes anomaly scores and risk levels for permission × site category combos
"""

import logging
from typing import Dict, List, Tuple
from urllib.parse import urlparse

log = logging.getLogger("aipd.risk_engine")

# ─── Permission × Category Risk Matrix ───────────────────────────────────────
# Values: 0.0 = expected/normal, 1.0 = highly suspicious

RISK_MATRIX: Dict[str, Dict[str, float]] = {
    "camera": {
        "video_conference": 0.05,   # totally expected
        "social_media":     0.25,   # somewhat normal
        "education":        0.30,   # somewhat normal (video courses)
        "health":           0.45,   # unusual but possible (telemedicine)
        "e_commerce":       0.90,   # very suspicious
        "banking":          0.92,   # very suspicious
        "news":             0.95,   # almost certainly malicious
        "blog":             0.97,   # almost certainly malicious
        "search":           0.95,
        "entertainment":    0.55,
        "government":       0.60,
        "unknown":          0.80,
    },
    "microphone": {
        "video_conference": 0.05,
        "social_media":     0.25,
        "education":        0.30,
        "entertainment":    0.40,   # voice search in some apps
        "health":           0.45,
        "e_commerce":       0.88,
        "banking":          0.92,
        "news":             0.95,
        "blog":             0.97,
        "search":           0.40,   # voice search is common
        "government":       0.70,
        "unknown":          0.82,
    },
    "geolocation": {
        "e_commerce":       0.20,   # shipping, store locator
        "search":           0.15,   # local results
        "entertainment":    0.25,   # local events
        "social_media":     0.20,   # tagging
        "health":           0.25,   # nearby clinics
        "government":       0.20,   # local services
        "news":             0.60,
        "education":        0.55,
        "video_conference": 0.60,
        "banking":          0.70,
        "blog":             0.80,
        "unknown":          0.75,
    },
    "clipboard-read": {
        "e_commerce":       0.70,   # coupon codes - borderline
        "banking":          0.95,   # CRITICAL - password theft
        "social_media":     0.65,
        "education":        0.55,
        "news":             0.85,
        "blog":             0.92,
        "entertainment":    0.70,
        "search":           0.75,
        "video_conference": 0.50,   # meeting link copy
        "health":           0.80,
        "government":       0.80,
        "unknown":          0.90,
    },
    "clipboard-write": {
        "e_commerce":       0.30,   # copy order number, tracking
        "banking":          0.50,
        "social_media":     0.30,
        "education":        0.25,
        "news":             0.35,
        "blog":             0.35,
        "entertainment":    0.35,
        "search":           0.20,
        "video_conference": 0.20,   # copy meeting link
        "health":           0.40,
        "government":       0.35,
        "unknown":          0.65,
    },
    "notifications": {
        "e_commerce":       0.15,   # order updates
        "social_media":     0.10,   # messages, likes
        "news":             0.20,   # breaking news
        "entertainment":    0.20,
        "education":        0.25,
        "video_conference": 0.15,
        "banking":          0.40,   # could be phishing alerts
        "health":           0.30,
        "search":           0.45,
        "blog":             0.50,
        "government":       0.30,
        "unknown":          0.65,
    },
    "display-capture": {
        "video_conference": 0.10,   # screen sharing
        "education":        0.20,
        "entertainment":    0.50,
        "e_commerce":       0.85,
        "banking":          0.95,
        "news":             0.90,
        "blog":             0.95,
        "social_media":     0.60,
        "search":           0.85,
        "health":           0.70,
        "government":       0.75,
        "unknown":          0.90,
    }
}

# ─── Risk Level Thresholds ────────────────────────────────────────────────────

def score_to_risk_level(score: float) -> str:
    if score >= 0.90: return "critical"
    if score >= 0.70: return "high"
    if score >= 0.40: return "medium"
    return "low"

def score_to_recommendation(score: float, risk_level: str) -> str:
    if risk_level == "critical": return "block"
    if risk_level == "high": return "block"
    if risk_level == "medium": return "review"
    return "allow"

# ─── Suspicious Signals ───────────────────────────────────────────────────────

SUSPICIOUS_DOMAIN_PATTERNS = [
    "login", "secure", "account", "verify", "update", "confirm",
    "bank", "paypal", "amazon", "-secure", "auth", "signin",
    ".tk", ".xyz", ".ml", ".ga", ".cf",  # cheap TLDs often abused
]

TRUSTED_DOMAINS = [
    "google.com", "youtube.com", "facebook.com", "amazon.com",
    "microsoft.com", "apple.com", "zoom.us", "linkedin.com",
    "twitter.com", "instagram.com", "github.com", "stackoverflow.com",
    "wikipedia.org", "reddit.com", "netflix.com", "spotify.com"
]


class PermissionRiskEngine:
    def assess(self, permission: str, category: str, domain: str, url: str) -> Dict:
        """
        Compute anomaly score and risk level for a permission request.
        Returns dict with: risk_level, anomaly_score, recommendation, flags
        """
        # Base score from matrix
        perm_matrix = RISK_MATRIX.get(permission, {})
        base_score = perm_matrix.get(category, 0.70)  # default: somewhat suspicious if unknown

        # Apply modifiers
        modifiers = []
        flags = []

        # Domain trust modifier
        domain_trust = self._check_domain_trust(domain)
        if domain_trust == "trusted":
            base_score = max(0.0, base_score - 0.15)
            modifiers.append(("trusted_domain", -0.15))
        elif domain_trust == "suspicious":
            base_score = min(1.0, base_score + 0.20)
            modifiers.append(("suspicious_domain", +0.20))
            flags.append("SUSPICIOUS_DOMAIN_NAME")

        # Check for suspicious URL patterns
        if self._has_suspicious_url(url):
            base_score = min(1.0, base_score + 0.15)
            flags.append("SUSPICIOUS_URL_PATTERN")

        # Specific dangerous combos
        if permission == "clipboard-read" and category in ["banking", "e_commerce"]:
            base_score = min(1.0, base_score + 0.10)
            flags.append("CREDENTIAL_THEFT_RISK")

        if permission in ["camera", "microphone"] and category in ["news", "blog", "search"]:
            flags.append("POTENTIAL_SURVEILLANCE")

        if permission == "display-capture" and category not in ["video_conference", "education"]:
            flags.append("SCREEN_CAPTURE_RISK")

        if category == "unknown":
            flags.append("UNRECOGNIZED_SITE_CATEGORY")

        # Compute final risk
        anomaly_score = round(min(1.0, max(0.0, base_score)), 4)
        risk_level = score_to_risk_level(anomaly_score)
        recommendation = score_to_recommendation(anomaly_score, risk_level)

        # Add risk-based flags
        if risk_level in ["high", "critical"] and "UNUSUAL_FOR_CATEGORY" not in flags:
            flags.append("UNUSUAL_FOR_CATEGORY")

        if permission in ["clipboard-read", "clipboard-write"] and risk_level in ["high", "critical"]:
            flags.append("SENSITIVE_DATA_ACCESS")

        return {
            "risk_level": risk_level,
            "anomaly_score": anomaly_score,
            "recommendation": recommendation,
            "flags": flags,
            "modifiers": modifiers,
        }

    def _check_domain_trust(self, domain: str) -> str:
        """Returns: trusted, suspicious, or neutral"""
        domain_lower = domain.lower()

        # Check trusted list
        for trusted in TRUSTED_DOMAINS:
            if domain_lower == trusted or domain_lower.endswith(f".{trusted}"):
                return "trusted"

        # Check suspicious patterns
        for pattern in SUSPICIOUS_DOMAIN_PATTERNS:
            if pattern in domain_lower and not any(t in domain_lower for t in ["google", "microsoft", "apple", "amazon"]):
                return "suspicious"

        # Check for IP addresses (very suspicious)
        import re
        if re.match(r'^\d+\.\d+\.\d+\.\d+$', domain_lower):
            return "suspicious"

        return "neutral"

    def _has_suspicious_url(self, url: str) -> bool:
        """Check for suspicious URL patterns."""
        url_lower = url.lower()
        suspicious_patterns = [
            "phish", "malware", "hack", "exploit", "payload",
            "xss", "injection", "bypass", "/login.php?redirect=",
            "base64", "eval(", "document.cookie"
        ]
        return any(p in url_lower for p in suspicious_patterns)

    def get_permission_profile(self, category: str) -> Dict:
        """Get expected and suspicious permissions for a category."""
        normal = []
        suspicious = []

        for permission, matrix in RISK_MATRIX.items():
            score = matrix.get(category, 0.70)
            if score <= 0.30:
                normal.append(permission)
            elif score >= 0.70:
                suspicious.append(permission)

        return {"category": category, "normal": normal, "suspicious": suspicious}
