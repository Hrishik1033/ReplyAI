"""Per-channel LLM token usage for the last 24 hours."""
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import simulation
from app.config import settings
from app.dependencies import get_current_session, get_db
from app.models import AppSession, DraftUsage, ReplyDraft
from app.routers.youtube import _owned_channel

router = APIRouter(prefix="/api/usage", tags=["usage"])
Db = Annotated[AsyncSession, Depends(get_db)]
Session = Annotated[AppSession, Depends(get_current_session)]

ROLES = ("primary", "secondary")


def _limit(role: str) -> int:
    value = getattr(settings, f"llm_{role}_tokens_per_day")
    return max(0, value)


def _percent(used: int, limit: int) -> float:
    if limit <= 0:
        return 0.0
    return round(used / limit * 100, 1)


@router.get("/summary")
async def summary(session: Session, db: Db):
    """Reported token consumption over the rolling last 24 hours.

    Only counts the provider actually reported are summed. A request whose counts
    were unreadable stays unknown and is reported as ``unknown_requests`` rather than
    being counted as zero.
    """
    owner = await _owned_channel(db, session)
    since = datetime.now(UTC) - timedelta(hours=24)
    rows = (
        await db.execute(
            select(
                DraftUsage.role,
                func.coalesce(
                    func.sum(
                        func.coalesce(DraftUsage.input_tokens, 0)
                        + func.coalesce(DraftUsage.output_tokens, 0)
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(case((DraftUsage.consumption == "unknown", 1), else_=0)),
                    0,
                ),
            )
            .join(ReplyDraft, ReplyDraft.id == DraftUsage.draft_id)
            .where(
                ReplyDraft.channel_owner_id == owner.id,
                DraftUsage.created_at >= since,
            )
            .group_by(DraftUsage.role)
        )
    ).all()
    used_by_role = {role: int(used or 0) for role, used, _unknown in rows}
    unknown_requests = sum(int(unknown or 0) for _role, _used, unknown in rows)

    roles = {
        role: {
            "used": used_by_role.get(role, 0),
            "limit": _limit(role),
            "percent": _percent(used_by_role.get(role, 0), _limit(role)),
        }
        for role in ROLES
    }
    headline = max(ROLES, key=lambda role: roles[role]["percent"])
    return {
        "llm": {
            "used": roles[headline]["used"],
            "limit": roles[headline]["limit"],
            "percent": roles[headline]["percent"],
            "roles": roles,
            "unknown_requests": unknown_requests,
        },
        "simulation": simulation.enabled(),
    }
