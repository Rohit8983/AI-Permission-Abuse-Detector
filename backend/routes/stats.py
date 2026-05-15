"""
routes/stats.py — Analytics & Statistics Endpoints
"""

from fastapi import APIRouter
from models.database import Database

router = APIRouter()
db = Database()

@router.get("")
async def get_stats():
    """Get overall statistics."""
    return db.get_stats()

@router.get("/recent")
async def get_recent(limit: int = 20):
    """Get recent alerts."""
    return db.get_recent_alerts(limit=min(limit, 100))

@router.get("/top-domains")
async def top_domains():
    """Get top risky domains."""
    stats = db.get_stats()
    return stats.get("top_domains", [])

@router.get("/domain/{domain}")
async def domain_history(domain: str):
    """Get alert history for a specific domain."""
    return db.get_domain_history(domain)
