from hashlib import sha256
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client
from app.core.security import require_user
from app.services.notifications import send_user_notification

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


class TokenRegistration(BaseModel):
    token: str = Field(min_length=20, max_length=4096)


def registration_ref(uid: str, token: str):
    key = sha256(token.encode("utf-8")).hexdigest()
    return (
        get_firestore_client()
        .collection("users")
        .document(uid)
        .collection("fcmInstallations")
        .document(key)
    )


@router.post("/register")
def register_token(
    body: TokenRegistration,
    user: dict[str, Any] = Depends(require_user),
):
    registration_ref(user["uid"], body.token).set(
        {
            "token": body.token,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    return {"ok": True}


@router.delete("/register")
def unregister_token(
    body: TokenRegistration,
    user: dict[str, Any] = Depends(require_user),
):
    registration_ref(user["uid"], body.token).delete()
    return {"ok": True}


@router.post("/test")
def test_notification(user: dict[str, Any] = Depends(require_user)):
    if os.getenv("ENABLE_TEST_NOTIFICATIONS", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Test notifications are disabled.")
    sent = send_user_notification(
        user["uid"],
        "NIRNAY notification test",
        "Your browser is connected to Firebase Cloud Messaging.",
        {"url": "/app", "type": "test"},
    )
    return {"ok": True, "sent": sent}
