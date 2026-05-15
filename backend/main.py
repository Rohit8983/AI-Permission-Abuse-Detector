"""
main.py — AI Permission Abuse Detector Backend
FastAPI server with ML-powered site classification and permission risk analysis
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import uvicorn
import logging
from datetime import datetime
import json

from models.classifier import SiteClassifier
from models.risk_engine import PermissionRiskEngine
from models.database import Database
from models.explainer import PermissionExplainer
from routes.stats import router as stats_router
from routes.feedback import router as feedback_router

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("aipd")

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Permission Abuse Detector API",
    description="AI-powered browser permission risk analysis engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models & Services ────────────────────────────────────────────────────────

db = Database()
classifier = SiteClassifier()
risk_engine = PermissionRiskEngine()
explainer = PermissionExplainer()

@app.on_event("startup")
async def startup():
    log.info("Initializing AI Permission Detector backend...")
    db.init()
    classifier.load_or_train()
    log.info("✓ Backend ready")

# ─── Request / Response Models ────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    permission: str = Field(..., description="Permission name: camera, microphone, geolocation, etc.")
    url: str = Field(..., description="Full page URL")
    pageTitle: Optional[str] = Field(None, description="Page title")
    pageKeywords: Optional[List[str]] = Field(default_factory=list)
    metaDescription: Optional[str] = None
    metaKeywords: Optional[str] = None
    method: Optional[str] = None

class AnalyzeResponse(BaseModel):
    category: str
    riskLevel: str
    anomalyScore: float
    explanation: str
    recommendation: str
    flags: List[str]
    confidence: float
    source: str = "ai"
    timestamp: str

class FeedbackRequest(BaseModel):
    domain: str
    permission: str
    decision: str  # allow, block, trust_always, block_always

# ─── Core Analyze Endpoint ────────────────────────────────────────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_permission(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Main endpoint: classify site and assess permission request risk.
    Called by the Chrome extension content script for every permission interception.
    """
    try:
        # 1. Extract domain
        domain = extract_domain(request.url)

        # 2. Classify site category using ML model
        features = {
            "url": request.url,
            "domain": domain,
            "title": request.pageTitle or "",
            "keywords": " ".join(request.pageKeywords or []),
            "meta_desc": request.metaDescription or "",
            "meta_kw": request.metaKeywords or ""
        }
        category, confidence = classifier.predict(features)

        # 3. Compute risk from permission × category
        risk_result = risk_engine.assess(
            permission=request.permission,
            category=category,
            domain=domain,
            url=request.url
        )

        # 4. Generate human-readable explanation
        explanation = explainer.generate(
            permission=request.permission,
            category=category,
            risk_level=risk_result["risk_level"],
            domain=domain,
            flags=risk_result["flags"]
        )

        # 5. Store in DB async
        record = {
            "domain": domain,
            "url": request.url,
            "permission": request.permission,
            "category": category,
            "risk_level": risk_result["risk_level"],
            "anomaly_score": risk_result["anomaly_score"],
            "flags": json.dumps(risk_result["flags"]),
            "explanation": explanation,
            "timestamp": datetime.utcnow().isoformat()
        }
        background_tasks.add_task(db.insert_alert, record)

        log.info(f"[{risk_result['risk_level'].upper()}] {domain} → {request.permission} | cat={category} score={risk_result['anomaly_score']:.2f}")

        return AnalyzeResponse(
            category=category,
            riskLevel=risk_result["risk_level"],
            anomalyScore=risk_result["anomaly_score"],
            explanation=explanation,
            recommendation=risk_result["recommendation"],
            flags=risk_result["flags"],
            confidence=confidence,
            source="ai",
            timestamp=datetime.utcnow().isoformat()
        )

    except Exception as e:
        log.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ─── Health & Info ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "model": classifier.model_info(),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/")
async def root():
    return {
        "name": "AI Permission Abuse Detector API",
        "version": "1.0.0",
        "endpoints": ["/analyze", "/feedback", "/stats", "/health", "/stats/top-domains", "/stats/recent"]
    }

# ─── Include Routers ──────────────────────────────────────────────────────────

app.include_router(stats_router, prefix="/stats")
app.include_router(feedback_router, prefix="/feedback")

# ─── Utility ─────────────────────────────────────────────────────────────────

def extract_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.hostname.replace("www.", "") if parsed.hostname else url
    except:
        return url

# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
