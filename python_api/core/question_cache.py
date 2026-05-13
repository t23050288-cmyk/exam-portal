"""
question_cache.py
-----------------
Thread-safe in-process TTL cache for exam questions.

Why this exists:
  100 students clicking "Start Exam" simultaneously each hit /api/exam/questions.
  Without caching, that's 100 concurrent Supabase queries — each fetching 500 rows.
  With this cache, only the FIRST request per exam title hits the DB.
  Everyone else gets the cached result instantly (< 1ms).

TTL = 5 minutes (questions are immutable during an exam session).
Cache is invalidated when admin pushes new questions via ingest.
"""

import time
import threading
from typing import Any, Dict, Optional, Tuple

_cache: Dict[str, Tuple[Any, float]] = {}   # key -> (value, expires_at)
_lock = threading.Lock()

QUESTION_TTL = 300   # 5 minutes
CONFIG_TTL   = 60    # 1 minute for exam_config


def _make_key(exam_title: str, branch: str) -> str:
    return f"qs::{exam_title.strip().lower()}::{branch.strip().upper()}"

def _make_all_key(exam_title: str) -> str:
    return f"qs_all::{exam_title.strip().lower()}"

def _config_key(exam_title: str) -> str:
    return f"cfg::{exam_title.strip().lower()}"


def get_cached_questions(exam_title: str, branch: str) -> Optional[Any]:
    key = _make_key(exam_title, branch)
    with _lock:
        entry = _cache.get(key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        # Also try all-branch key as fallback
        all_key = _make_all_key(exam_title)
        entry = _cache.get(all_key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
    return None


def set_cached_questions(exam_title: str, branch: str, questions: Any, is_fallback: bool = False):
    with _lock:
        expires = time.monotonic() + QUESTION_TTL
        key = _make_key(exam_title, branch)
        _cache[key] = (questions, expires)
        if is_fallback:
            all_key = _make_all_key(exam_title)
            _cache[all_key] = (questions, expires)


def get_cached_config(exam_title: str) -> Optional[Any]:
    key = _config_key(exam_title)
    with _lock:
        entry = _cache.get(key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
    return None


def set_cached_config(exam_title: str, config: Any):
    with _lock:
        _cache[_config_key(exam_title)] = (config, time.monotonic() + CONFIG_TTL)


def invalidate_exam(exam_title: str):
    """Call this when admin ingests new questions or updates config."""
    prefix_qs  = f"qs::{exam_title.strip().lower()}"
    prefix_all = f"qs_all::{exam_title.strip().lower()}"
    prefix_cfg = f"cfg::{exam_title.strip().lower()}"
    with _lock:
        keys_to_del = [k for k in _cache if k.startswith(prefix_qs)
                                         or k.startswith(prefix_all)
                                         or k.startswith(prefix_cfg)]
        for k in keys_to_del:
            del _cache[k]


def invalidate_all():
    """Wipe the entire cache (used after bulk ingest)."""
    with _lock:
        _cache.clear()


def cache_stats() -> Dict[str, Any]:
    now = time.monotonic()
    with _lock:
        total = len(_cache)
        alive = sum(1 for _, exp in _cache.values() if now < exp)
        expired = total - alive
    return {"total": total, "alive": alive, "expired": expired}
