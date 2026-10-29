from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import auth as firebase_auth, firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client, get_firebase_app
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])
Role = Literal["user", "reviewer", "admin"]


def require_admin(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    # Role is read only from a verified Firebase ID token's custom claims.
    # Never trust a role supplied in a request body or browser profile.
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required.")
    return user


def _count(collection: str) -> int:
    # Aggregation count avoids downloading all documents merely to count them.
    client = get_firestore_client()
    try:
        result = client.collection(collection).count().get()
        return int(result[0][0].value)
    except (AttributeError, IndexError, TypeError):
        # Compatibility fallback for older Firestore SDKs.
        return sum(1 for _ in client.collection(collection).stream())


def _audit(actor: dict[str, Any], action: str, target_uid: str, details: dict[str, Any]) -> None:
    get_firestore_client().collection("admin_audit_logs").add({
        "actorUid": actor["uid"],
        "actorEmail": actor.get("email"),
        "action": action,
        "targetUid": target_uid,
        "details": details,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })


class RoleUpdate(BaseModel):
    role: Role


@router.get("/overview")
def overview(admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_firestore_client()
    return {
        "users": _count("users"),
        "tenders": _count("tenders"),
        "audit_events": _count("admin_audit_logs"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Counts reflect Firestore collections; tender count is zero until real tenders are persisted.",
    }


@router.get("/users")
def list_users(
    limit: int = Query(default=50, ge=1, le=100),
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    # Firestore profile documents intentionally do not store authoritative roles;
    # role comes from Firebase Auth custom claims.
    db = get_firestore_client()
    query = db.collection("users").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)
    users = []
    for snapshot in query.stream():
        profile = snapshot.to_dict() or {}
        try:
            auth_user = firebase_auth.get_user(snapshot.id, app=get_firebase_app())
            role = (auth_user.custom_claims or {}).get("role", "user")
            disabled = auth_user.disabled
            email_verified = auth_user.email_verified
        except firebase_auth.UserNotFoundError:
            role, disabled, email_verified = "user", False, bool(profile.get("emailVerified", False))
        users.append({
            "uid": snapshot.id,
            "email": profile.get("email"),
            "display_name": profile.get("displayName"),
            "role": role if role in ("user", "reviewer", "admin") else "user",
            "disabled": disabled,
            "email_verified": email_verified,
            "created_at": profile.get("createdAt").isoformat() if hasattr(profile.get("createdAt"), "isoformat") else None,
            "last_login_at": profile.get("lastLoginAt").isoformat() if hasattr(profile.get("lastLoginAt"), "isoformat") else None,
        })
    return {"items": users, "limit": limit}


@router.patch("/users/{target_uid}/role")
def update_user_role(
    target_uid: str,
    body: RoleUpdate,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, str]:
    if target_uid == admin["uid"]:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")
    try:
        target = firebase_auth.get_user(target_uid, app=get_firebase_app())
    except firebase_auth.UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Firebase user not found.") from exc

    # Preserve unrelated custom claims while replacing only the role claim.
    claims = dict(target.custom_claims or {})
    claims["role"] = body.role
    firebase_auth.set_custom_user_claims(target_uid, claims, app=get_firebase_app())
    _audit(admin, "user.role.updated", target_uid, {"role": body.role})
    return {"uid": target_uid, "role": body.role, "message": "Role updated. The user must refresh their ID token for the change to take effect."}


@router.get("/audit")
def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    query = get_firestore_client().collection("admin_audit_logs").order_by(
        "createdAt", direction=firestore.Query.DESCENDING
    ).limit(limit)
    items = []
    for snapshot in query.stream():
        item = snapshot.to_dict() or {}
        created = item.get("createdAt")
        items.append({
            "id": snapshot.id,
            "actor_uid": item.get("actorUid"),
            "actor_email": item.get("actorEmail"),
            "action": item.get("action"),
            "target_uid": item.get("targetUid"),
            "details": item.get("details", {}),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else None,
        })
    return {"items": items, "limit": limit}
