"""
scripts/test_api.py — Test the full API end-to-end
Run this after starting the backend: python main.py
"""

import requests
import json
import sys

BASE = "http://localhost:8000"

def color(text, code): return f"\033[{code}m{text}\033[0m"
def green(t): return color(t, "32")
def red(t): return color(t, "31")
def yellow(t): return color(t, "33")
def bold(t): return color(t, "1")
def cyan(t): return color(t, "36")

TEST_CASES = [
    # (description, permission, url, title, keywords, expected_risk)
    ("Shopping site + Camera → HIGH", "camera", "https://amazon.com/products", "Amazon Shop", ["shop", "buy", "cart"], ["high", "critical"]),
    ("News site + Microphone → CRITICAL", "microphone", "https://bbc.com/news", "BBC News", ["news", "article", "breaking"], ["critical"]),
    ("Video conf + Camera → LOW", "camera", "https://zoom.us/meeting", "Zoom Meeting", ["video", "conference", "meeting"], ["low"]),
    ("Banking + Clipboard Read → CRITICAL", "clipboard-read", "https://chase.com/login", "Chase Bank", ["bank", "account", "login"], ["critical"]),
    ("Shopping + Location → LOW/MEDIUM", "geolocation", "https://amazon.com", "Amazon", ["shop", "buy"], ["low", "medium"]),
    ("Blog + Camera → CRITICAL", "camera", "https://myblog.com/post", "My Blog Post", ["blog", "write", "personal"], ["high", "critical"]),
    ("Social + Notifications → LOW", "notifications", "https://twitter.com", "Twitter Feed", ["social", "tweet", "follow"], ["low", "medium"]),
    ("Banking + Notifications → MEDIUM/HIGH", "notifications", "https://wellsfargo.com", "Wells Fargo Bank", ["bank", "account"], ["medium", "high"]),
]

def test_health():
    print(f"\n{bold('Testing /health...')}")
    try:
        r = requests.get(f"{BASE}/health", timeout=5)
        r.raise_for_status()
        data = r.json()
        print(f"  {green('✓')} Status: {data['status']}")
        print(f"  {green('✓')} Model: {data['model']['type']}")
        print(f"  {green('✓')} Categories: {', '.join(data['model']['categories'][:5])}...")
        return True
    except Exception as e:
        print(f"  {red('✗')} Health check failed: {e}")
        print(f"  Make sure the backend is running: python main.py")
        return False

def test_analyze():
    print(f"\n{bold('Testing /analyze endpoint...')}")
    passed = 0
    failed = 0

    for desc, perm, url, title, keywords, expected_risks in TEST_CASES:
        payload = {
            "permission": perm,
            "url": url,
            "pageTitle": title,
            "pageKeywords": keywords
        }

        try:
            r = requests.post(f"{BASE}/analyze", json=payload, timeout=10)
            r.raise_for_status()
            data = r.json()

            actual_risk = data["riskLevel"]
            ok = actual_risk in expected_risks

            status = green("✓ PASS") if ok else red("✗ FAIL")
            risk_color = {"low": "32", "medium": "33", "high": "31", "critical": "35"}.get(actual_risk, "37")

            print(f"  {status} | {desc}")
            print(f"         Risk: {color(actual_risk.upper(), risk_color)} | Score: {data['anomalyScore']:.2f} | Category: {data['category']} | Action: {data['recommendation'].upper()}")
            print(f"         {cyan(data['explanation'][:90])}...")
            if data.get('flags'):
                print(f"         Flags: {', '.join(data['flags'])}")
            print()

            if ok:
                passed += 1
            else:
                failed += 1
                print(f"         {yellow(f'Expected: {expected_risks}, Got: {actual_risk}')}")

        except Exception as e:
            print(f"  {red('✗ ERROR')} | {desc}: {e}")
            failed += 1

    return passed, failed

def test_stats():
    print(f"\n{bold('Testing /stats...')}")
    try:
        r = requests.get(f"{BASE}/stats", timeout=5)
        r.raise_for_status()
        data = r.json()
        print(f"  {green('✓')} Total alerts: {data.get('total_alerts', 0)}")
        print(f"  {green('✓')} By risk: {data.get('by_risk_level', {})}")
        return True
    except Exception as e:
        print(f"  {red('✗')} Stats failed: {e}")
        return False

def test_feedback():
    print(f"\n{bold('Testing /feedback...')}")
    try:
        r = requests.post(f"{BASE}/feedback", json={
            "domain": "test.com",
            "permission": "camera",
            "decision": "block"
        }, timeout=5)
        r.raise_for_status()
        print(f"  {green('✓')} Feedback submitted successfully")
        return True
    except Exception as e:
        print(f"  {red('✗')} Feedback failed: {e}")
        return False

if __name__ == "__main__":
    print(bold("=" * 60))
    print(bold("  AI Permission Abuse Detector — API Test Suite"))
    print(bold("=" * 60))

    if not test_health():
        print(f"\n{red('Backend not running. Start it with: python main.py')}")
        sys.exit(1)

    passed, failed = test_analyze()
    test_stats()
    test_feedback()

    print(bold("=" * 60))
    print(bold("  Results"))
    print(bold("=" * 60))
    print(f"  Analyze Tests: {green(str(passed))} passed, {red(str(failed)) if failed else green('0')} failed")
    print()

    if failed == 0:
        print(green("  ✓ All tests passed! Backend is working correctly."))
    else:
        print(yellow(f"  ⚠ {failed} test(s) need attention (risk level mismatches)."))

    sys.exit(0 if failed == 0 else 1)
