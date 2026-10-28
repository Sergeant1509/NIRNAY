from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client
from app.core.security import require_user
from app.services.document_extraction import extract_document_text

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
    document_ids = application.get("documentIds", [])
    if len(document_ids) > 10:
        raise HTTPException(status_code=413, detail="Preliminary screening is limited to 10 selected documents per run.")
    owned_documents = _user_documents(application.get("bidderUid", ""))
    selected = [(doc_id, owned_documents[doc_id]) for doc_id in document_ids if doc_id in owned_documents]
    extracted = {}
    extraction_errors = {}
    for doc_id, metadata in selected:
        try:
            extracted[doc_id] = extract_document_text(metadata).casefold()
        except Exception as exc:
            # Keep private storage URLs and provider details out of API responses.
            extraction_errors[doc_id] = type(exc).__name__

    findings = []
    for requirement in tender.get("requirements", []):
        expected = [str(value).strip().casefold() for value in requirement.get("expected_evidence", []) if str(value).strip()]
        matched = []
        matched_phrases = []
        for doc_id, metadata in selected:
            filename = str(metadata.get("filename", ""))
            content = extracted.get(doc_id, "")
            filename_match = any(term in filename.casefold() for term in expected)
            content_matches = [term for term in expected if term in content]
            if filename_match or content_matches:
                matched.append(filename)
            matched_phrases.extend(content_matches)

        if matched_phrases:
            outcome = "needs_review"
            reason = "One or more expected evidence phrases were found in extracted document text. Verify the actual clause, values, dates, validity, and authenticity before deciding compliance."
        elif extraction_errors:
            outcome = "needs_review"
            reason = "Some selected documents could not be read, so absence of evidence cannot be established. Check extraction status and review the original files."
        elif matched:
            outcome = "needs_review"
            reason = "A filename appears relevant, but the expected phrase was not found in readable document text. Human review is required."
        elif requirement.get("mandatory", True):
            outcome = "missing"
            reason = "No expected evidence phrase was found in the readable contents or filenames of selected documents."
        else:
            outcome = "needs_review"
            reason = "Optional requirement requires a reviewer decision."
        findings.append({
            "requirement_id": requirement.get("id"),
            "requirement_title": requirement.get("title"),
            "mandatory": requirement.get("mandatory", True),
            "outcome": outcome,
            "matched_filenames": matched,
            "matched_evidence_phrases": sorted(set(matched_phrases)),
            "reason": reason,
        })
    result_id = "vr_" + uuid4().hex
    result = {
        "id": result_id,
        "applicationId": application_id,
        "tenderId": application.get("tenderId"),
        "status": "needs_review" if any(item["outcome"] == "needs_review" for item in findings) else "incomplete",
        "findings": findings,
        "method": "document_content_phrase_screening_v1",
        "documents_read": len(extracted),
        "documents_unreadable": len(extraction_errors),
        "disclaimer": "This preliminary screen uses filenames only. It does not read document contents, verify signatures, or establish legal compliance. Human review is required.",
        "createdBy": user["uid"],
        "createdAt": datetime.now(timezone.utc),
    }
    db.collection("verificationRuns").document(result_id).set(result)
    app_ref.update({"latestVerificationRunId": result_id, "updatedAt": datetime.now(timezone.utc)})
    result["createdAt"] = result["createdAt"].isoformat()
    return result
