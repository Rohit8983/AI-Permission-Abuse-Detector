"""
models/database.py — SQLite database for alerts and feedback
"""

import sqlite3
import logging
import os
import json
from typing import List, Dict, Optional
from datetime import datetime

log = logging.getLogger("aipd.database")

DB_PATH = "data/aipd.db"


class Database:
    def __init__(self):
        self.db_path = DB_PATH

    def init(self):
        os.makedirs("data", exist_ok=True)
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT NOT NULL,
                    url TEXT,
                    permission TEXT NOT NULL,
                    category TEXT,
                    risk_level TEXT,
                    anomaly_score REAL,
                    flags TEXT,
                    explanation TEXT,
                    timestamp TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS user_decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT NOT NULL,
                    permission TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    alert_id INTEGER,
                    timestamp TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT,
                    permission TEXT,
                    decision TEXT,
                    correct_category TEXT,
                    timestamp TEXT DEFAULT (datetime('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_alerts_domain ON alerts(domain);
                CREATE INDEX IF NOT EXISTS idx_alerts_risk ON alerts(risk_level);
                CREATE INDEX IF NOT EXISTS idx_alerts_permission ON alerts(permission);
                CREATE INDEX IF NOT EXISTS idx_decisions_domain ON user_decisions(domain);
            """)
        log.info(f"✓ Database initialized at {DB_PATH}")

    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def insert_alert(self, record: Dict):
        try:
            with self._conn() as conn:
                conn.execute("""
                    INSERT INTO alerts (domain, url, permission, category, risk_level,
                        anomaly_score, flags, explanation, timestamp)
                    VALUES (:domain, :url, :permission, :category, :risk_level,
                        :anomaly_score, :flags, :explanation, :timestamp)
                """, record)
        except Exception as e:
            log.error(f"DB insert error: {e}")

    def insert_decision(self, domain: str, permission: str, decision: str, alert_id: Optional[int] = None):
        try:
            with self._conn() as conn:
                conn.execute("""
                    INSERT INTO user_decisions (domain, permission, decision, alert_id, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                """, (domain, permission, decision, alert_id, datetime.utcnow().isoformat()))
        except Exception as e:
            log.error(f"DB decision error: {e}")

    def insert_feedback(self, domain: str, permission: str, decision: str, correct_category: Optional[str] = None):
        try:
            with self._conn() as conn:
                conn.execute("""
                    INSERT INTO feedback (domain, permission, decision, correct_category)
                    VALUES (?, ?, ?, ?)
                """, (domain, permission, decision, correct_category))
        except Exception as e:
            log.error(f"DB feedback error: {e}")

    def get_recent_alerts(self, limit: int = 50) -> List[Dict]:
        try:
            with self._conn() as conn:
                rows = conn.execute("""
                    SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?
                """, (limit,)).fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            log.error(f"DB query error: {e}")
            return []

    def get_stats(self) -> Dict:
        try:
            with self._conn() as conn:
                total = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
                by_risk = conn.execute("""
                    SELECT risk_level, COUNT(*) as cnt FROM alerts GROUP BY risk_level
                """).fetchall()
                by_perm = conn.execute("""
                    SELECT permission, COUNT(*) as cnt FROM alerts
                    GROUP BY permission ORDER BY cnt DESC LIMIT 10
                """).fetchall()
                by_category = conn.execute("""
                    SELECT category, COUNT(*) as cnt FROM alerts
                    GROUP BY category ORDER BY cnt DESC
                """).fetchall()
                top_domains = conn.execute("""
                    SELECT domain, COUNT(*) as cnt, MAX(risk_level) as max_risk
                    FROM alerts GROUP BY domain ORDER BY cnt DESC LIMIT 10
                """).fetchall()
                decisions_total = conn.execute("SELECT COUNT(*) FROM user_decisions").fetchone()[0]

                return {
                    "total_alerts": total,
                    "by_risk_level": {r["risk_level"]: r["cnt"] for r in by_risk},
                    "by_permission": {r["permission"]: r["cnt"] for r in by_perm},
                    "by_category": {r["category"]: r["cnt"] for r in by_category},
                    "top_domains": [dict(r) for r in top_domains],
                    "total_decisions": decisions_total,
                }
        except Exception as e:
            log.error(f"Stats error: {e}")
            return {}

    def get_domain_history(self, domain: str) -> List[Dict]:
        try:
            with self._conn() as conn:
                rows = conn.execute("""
                    SELECT * FROM alerts WHERE domain = ?
                    ORDER BY created_at DESC LIMIT 20
                """, (domain,)).fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            return []

    def get_feedback_for_training(self) -> List[Dict]:
        try:
            with self._conn() as conn:
                rows = conn.execute("""
                    SELECT f.*, a.url, a.category
                    FROM feedback f
                    LEFT JOIN alerts a ON a.domain = f.domain AND a.permission = f.permission
                    WHERE f.decision IN ('block', 'block_always')
                    ORDER BY f.timestamp DESC
                    LIMIT 100
                """).fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            return []
