from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/applications", tags=["Applications"])
ApplicationStatus = Literal["draft", "submitted", "under_review"]


class ApplicationCreate(BaseModel):
    tender_id: str = Field(min_length=1, max_length=100)
    organization_name: str = Field(min_length=2, max_length=200)
    document_ids: list[str] = Field(default_factory=list, max_length=50)
    status: ApplicationStatus = "draft"


def _serialize(snapshot: Any) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    for key in ("createdAt", "updatedAt", "submittedAt"):
        value = data.get(key)
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    data["id"] = snapshot.id
    return data


def _user_documents(uid: str) -> dict[str, dict[str, Any]]:
    snapshots = get_firestore_client().collection("users").document(uid).collection("documents").stream()
    return {item.id: (item.to_dict() or {}) for item in snapshots}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_application(body: ApplicationCreate, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    db = get_firestore_client()
    tender_ref = db.collection("tenders").document(body.tender_id)
    tender = tender_ref.get()
    if not tender.exists or (tender.to_dict() or {}).get("status") != "open":
        raise HTTPException(status_code=404, detail="Open tender not found.")
    owned_documents = _user_documents(user["uid"])
    missing = sorted(set(body.document_ids) - set(owned_documents))
    if missing:
        raise HTTPException(status_code=400, detail="One or more selected documents do not belong to your account.")
    application_id = "app_" + uuid4().hex
    now = datetime.now(timezone.utc)
    data = {
        "tenderId": body.tender_id,
        "tenderNumber": (tender.to_dict() or {}).get("tender_number"),
        "tenderTitle": (tender.to_dict() or {}).get("title"),
        "bidderUid": user["uid"],
        "bidderEmail": user.get("email"),
        "organizationName": body.organization_name.strip(),
        "documentIds": body.document_ids,
        "status": body.status,
        "createdAt": now,
        "updatedAt": now,
        "submittedAt": now if body.status == "submitted" else None,
        "schemaVersion": 1,
    }
    ref = db.collection("applications").document(application_id)
    ref.set(data)
    return _serialize(ref.get())


@router.get("")
def list_my_applications(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    query = get_firestore_client().collection("applications").where("bidderUid", "==", user["uid"]).limit(100)
    items = [_serialize(snapshot) for snapshot in query.stream()]
    items.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return {"items": items}


@router.get("/{application_id}")
def get_application(application_id: str, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    db = get_firestore_client()
    snapshot = db.collection("applications").document(application_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Application not found.")
    data = _serialize(snapshot)
    if data.get("bidderUid") != user["uid"] and user.get("role") not in {"admin", "reviewer"}:
        raise HTTPException(status_code=404, detail="Application not found.")
    return data


@router.post("/{application_id}/evaluate")
def evaluate_application(application_id: str, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    db = get_firestore_client()
    app_ref = db.collection("applications").document(application_id)
    snapshot = app_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Application not found.")
    application = snapshot.to_dict() or {}
    if application.get("bidderUid") != user["uid"] and user.get("role") not in {"admin", "reviewer"}:
        raise HTTPException(status_code=404, detail="Application not found.")

    tender_snapshot = db.collection("tenders").document(application.get("tenderId", "")).get()
    if not tender_snapshot.exists:
        raise HTTPException(status_code=409, detail="The linked tender no longer exists.")
    tender = tender_snapshot.to_dict() or {}
    owned_documents = _user_documents(application.get("bidderUid", ""))
    selected = [owned_documents[doc_id] for doc_id in application.get("documentIds", []) if doc_id in owned_documents]
    filenames = [str(item.get("filename", "")).casefold() for item in selected]
    findings = []
    for requirement in tender.get("requirements", []):
        expected = [str(value).casefold() for value in requirement.get("expected_evidence", [])]
        matched = [name for name in filenames if any(term and (term in name or name in term) for term in expected)]
        if matched:
            outcome = "needs_review"
            reason = "A filename appears relevant, but document contents and authenticity have not been verified."
        elif requirement.get("mandatory", True):
            outcome = "missing"
            reason = "No selected document filename matches the expected evidence labels."
        else:
            outcome = "needs_review"
            reason = "Optional requirement requires a reviewer decision."
        findings.append({
            "requirement_id": requirement.get("id"),
            "requirement_title": requirement.get("title"),
            "mandatory": requirement.get("mandatory", True),
            "outcome": outcome,
            "matched_filenames": matched,
            "reason": reason,
        })
    result_id = "vr_" + uuid4().hex
    result = {
        "id": result_id,
        "applicationId": application_id,
        "tenderId": application.get("tenderId"),
        "status": "needs_review" if any(item["outcome"] == "needs_review" for item in findings) else "incomplete",
        "findings": findings,
        "method": "filename_screening_v1",
        "disclaimer": "This preliminary screen uses filenames only. It does not read document contents, verify signatures, or establish legal compliance. Human review is required.",
        "createdBy": user["uid"],
        "createdAt": datetime.now(timezone.utc),
    }
    db.collection("verificationRuns").document(result_id).set(result)
    app_ref.update({"latestVerificationRunId": result_id, "updatedAt": datetime.now(timezone.utc)})
    result["createdAt"] = result["createdAt"].isoformat()
    return result
