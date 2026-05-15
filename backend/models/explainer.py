"""
models/explainer.py — Human-Readable Explanation Generator
Converts technical risk assessments into clear, user-friendly language
"""

import logging
from typing import List, Optional

log = logging.getLogger("aipd.explainer")

# ─── Explanation Templates ────────────────────────────────────────────────────

TEMPLATES = {
    ("camera", "e_commerce"): {
        "high": "This appears to be an online shopping site. Camera access has no legitimate use in e-commerce — your webcam could be used to capture images or video without your knowledge.",
        "critical": "ALERT: This shopping site is requesting camera access. E-commerce platforms have absolutely no need for your camera. This is a strong indicator of surveillance or malicious data collection. Block immediately.",
        "medium": "This shopping site is requesting camera access, which is not typical for e-commerce. Consider whether you've specifically enabled a video feature before allowing this."
    },
    ("camera", "news"): {
        "high": "News and media websites have no legitimate need to access your camera. This request is highly unusual and may indicate this site is attempting unauthorized surveillance.",
        "critical": "This news site is requesting camera access, which is never required to read articles. This is almost certainly a sign of malicious behavior.",
    },
    ("camera", "banking"): {
        "high": "Legitimate banks rarely require camera access. This could indicate a phishing site impersonating your bank, or an attempt to capture images for identity theft.",
        "critical": "CRITICAL: A banking site is requesting camera access. Real banks do not need your camera. This could be a phishing site designed to steal your identity. Do not allow.",
    },
    ("camera", "blog"): {
        "high": "Blog and personal websites have no reason to access your camera. This request is highly suspicious and may indicate a malicious script on this page.",
        "critical": "A blog site is requesting camera access. This is almost never legitimate. Block this request immediately.",
    },
    ("microphone", "e_commerce"): {
        "high": "Shopping sites don't need microphone access. This could allow the site to listen to ambient conversations near your device — a serious privacy violation.",
        "critical": "ALERT: This shopping site wants to access your microphone. E-commerce platforms have no legitimate need for audio access. This may be an attempt to eavesdrop on conversations.",
    },
    ("microphone", "news"): {
        "high": "News websites do not need microphone access. This request may indicate an attempt to record conversations happening near your device.",
        "critical": "A news site is requesting microphone access. This is extremely unusual and potentially dangerous.",
    },
    ("microphone", "banking"): {
        "high": "Microphone access from a banking site is highly suspicious. Legitimate financial institutions do not listen to your microphone. Verify you are on the correct site.",
        "critical": "CRITICAL: A banking site is requesting microphone access. This is never required and could indicate a phishing attack. Do not allow.",
    },
    ("clipboard-read", "banking"): {
        "high": "Clipboard access allows this site to read everything you copy — including passwords, credit card numbers, and OTPs. Banking sites should never request this.",
        "critical": "CRITICAL: A banking site wants to read your clipboard. This could allow theft of copied passwords, OTPs, or account numbers. Block this immediately.",
    },
    ("clipboard-read", "e_commerce"): {
        "high": "This shopping site wants to read your clipboard, which may include passwords or payment information you recently copied. This is an unusual request for an e-commerce site.",
        "critical": "ALERT: This shopping site is requesting clipboard read access. This could expose sensitive data you've recently copied, including credit card numbers or passwords.",
    },
    ("geolocation", "news"): {
        "high": "News articles do not require your physical location. This request may be for precise tracking of where you read news, which is a privacy concern.",
        "medium": "This news site is requesting your location, which is not typically needed to read content. It may be for regional content, but be aware of the privacy implications.",
    },
    ("geolocation", "banking"): {
        "high": "Sharing your precise GPS location with banking sites is risky. Banks typically use IP-based location for fraud detection and do not require exact GPS coordinates.",
    },
    ("notifications", "banking"): {
        "high": "Notification permissions from banking sites can be abused to send fake security alerts that impersonate your bank in phishing attacks.",
        "medium": "This banking site is requesting notification access. While some banks use notifications for legitimate alerts, ensure this is your actual bank before allowing.",
    },
    ("display-capture", "e_commerce"): {
        "high": "Screen capture access is not required for shopping. This could allow the site to capture images of your entire screen, potentially exposing sensitive information.",
        "critical": "ALERT: This shopping site wants to capture your screen. This is never legitimate for e-commerce and could expose everything visible on your display.",
    },
}

# ─── Generic Templates ────────────────────────────────────────────────────────

GENERIC_TEMPLATES = {
    "camera": {
        "critical": "Camera access was requested by a site that has no legitimate need for it. This could enable unauthorized video surveillance. Block this permission.",
        "high": "This site is requesting camera access, which is unusual for this type of website. Ensure you trust this site completely before allowing camera access.",
        "medium": "Camera access was requested. While potentially legitimate, consider whether this site type actually needs video access.",
        "low": "Camera access was requested, which appears normal for this type of site.",
    },
    "microphone": {
        "critical": "Microphone access was requested by a site with no legitimate need for audio. This could enable recording of nearby conversations. Block immediately.",
        "high": "This site is requesting microphone access, which is unusual for this category. Be cautious — audio access allows the site to hear everything near your device.",
        "medium": "Microphone access was requested. Verify that you intend to use audio features on this site before allowing.",
        "low": "Microphone access was requested, which appears normal for this type of site (e.g., video calls).",
    },
    "geolocation": {
        "critical": "Location access was requested by a site with no clear need for it. This enables precise tracking of your physical location. Block unless you specifically need this feature.",
        "high": "This site is requesting your location, which is unusual for this website type. Your location data can be stored and shared with third parties.",
        "medium": "Location access was requested. This is somewhat unusual for this site type — consider using approximate location or denying if not needed.",
        "low": "Location access was requested, which is common for this type of site (e.g., finding nearby stores).",
    },
    "clipboard-read": {
        "critical": "CRITICAL: Clipboard read access allows this site to see everything you copy — passwords, credit card numbers, personal messages, and OTPs. This is almost never legitimate. Block immediately.",
        "high": "This site wants to read your clipboard content. Your clipboard may contain sensitive data like passwords or payment information. Only allow if you specifically need to paste something from the site.",
        "medium": "Clipboard read access was requested. Be aware that your copied content (including sensitive data) will be accessible to this site.",
        "low": "Clipboard read access was requested for what appears to be a legitimate purpose.",
    },
    "clipboard-write": {
        "high": "This site wants to write to your clipboard. While less dangerous than reading, this can inject malicious content into what you paste elsewhere.",
        "medium": "Clipboard write access was requested. This allows the site to set what you paste in other applications.",
        "low": "Clipboard write access was requested, which is common for copy-to-clipboard buttons.",
    },
    "notifications": {
        "high": "Notification access from this site type is unusual. Malicious sites use notifications for persistent spam or phishing alerts.",
        "medium": "Notification access was requested. Be aware that allowing this lets the site send you alerts even when you're not on the page.",
        "low": "Notification access was requested, which is normal for this type of site.",
    },
    "display-capture": {
        "critical": "Screen capture access was requested. This allows the site to see your entire screen, including other tabs, applications, and any sensitive data visible. Only allow for trusted video conferencing tools.",
        "high": "This site is requesting screen capture access, which is unusual for this website category. Only video conferencing and specific professional tools legitimately need this.",
        "medium": "Screen capture was requested. Ensure you understand and trust this site before sharing your screen.",
        "low": "Screen capture was requested, which is expected for video conferencing tools.",
    },
}

# ─── Flag Annotations ─────────────────────────────────────────────────────────

FLAG_NOTES = {
    "CREDENTIAL_THEFT_RISK": " ⚠ This combination is a known pattern for credential theft attacks.",
    "POTENTIAL_SURVEILLANCE": " 🎥 Unauthorized audio/video access is a common technique in malware.",
    "SCREEN_CAPTURE_RISK": " 🖥️ Screen capture can expose all data visible on your display.",
    "SUSPICIOUS_DOMAIN_NAME": " 🔍 The domain name shows patterns common in phishing sites.",
    "SUSPICIOUS_URL_PATTERN": " 🚨 The URL contains patterns associated with malicious pages.",
    "UNRECOGNIZED_SITE_CATEGORY": " ❓ This site could not be classified — treat with extra caution.",
}


class PermissionExplainer:
    def generate(
        self,
        permission: str,
        category: str,
        risk_level: str,
        domain: str,
        flags: List[str]
    ) -> str:
        """Generate a clear, human-readable explanation."""

        # Try specific template first
        specific = TEMPLATES.get((permission, category), {})
        if risk_level in specific:
            explanation = specific[risk_level]
        elif "high" in specific and risk_level == "critical":
            explanation = specific["high"]
        else:
            # Fall back to generic
            generic = GENERIC_TEMPLATES.get(permission, {})
            explanation = generic.get(risk_level, generic.get("medium",
                f"This site requested {permission} access. The risk level for this combination is {risk_level}."
            ))

        # Append flag annotations for serious flags
        serious_flags = [f for f in flags if f in FLAG_NOTES]
        if serious_flags and risk_level in ["high", "critical"]:
            explanation += FLAG_NOTES[serious_flags[0]]

        return explanation

    def generate_recommendation(self, risk_level: str, permission: str, category: str) -> str:
        """Generate a specific action recommendation."""
        if risk_level == "critical":
            return f"Block this permission request immediately. There is no legitimate reason for a {category.replace('_', ' ')} site to access your {permission}."
        if risk_level == "high":
            return f"We recommend blocking this request. If you believe it's legitimate, navigate away and come back to verify the site's identity."
        if risk_level == "medium":
            return f"Consider whether you actually need {permission} features on this site before allowing."
        return f"This appears to be a legitimate {permission} request for this type of site. You may allow it."
