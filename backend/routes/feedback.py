"""
routes/feedback.py — User Decision Feedback Endpoint for Model Improvement
"""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from models.database import Database
import logging

router = APIRouter()
db = Database()
log = logging.getLogger("aipd.feedback")


class FeedbackRequest(BaseModel):
    domain: str
    permission: str
    decision: str
    correctCategory: Optional[str] = None


@router.post("")
async def submit_feedback(req: FeedbackRequest, background_tasks: BackgroundTasks):
    """
    Store user feedback for model improvement.
    Called when user makes allow/block decisions.
    """
    background_tasks.add_task(
        db.insert_feedback,
        req.domain, req.permission, req.decision, req.correctCategory
    )

    log.info(f"Feedback: {req.domain} | {req.permission} | {req.decision}")
    return {"ok": True, "message": "Feedback recorded. Thank you for improving the model."}


@router.get("/summary")
async def feedback_summary():
    """Get feedback statistics for model improvement."""
    feedback = db.get_feedback_for_training()
    return {
        "total": len(feedback),
        "decisions": {
            "block": sum(1 for f in feedback if "block" in f.get("decision", "")),
            "allow": sum(1 for f in feedback if f.get("decision") == "allow"),
        }
    }
