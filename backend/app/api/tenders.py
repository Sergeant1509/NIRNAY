from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from firebase_admin import firestore
from pydantic import BaseModel, Field

from app.core.firebase import get_firestore_client
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/tenders", tags=["Tenders"])
TenderStatus = Literal["draft", "open", "closed", "archived"]


class RequirementInput(BaseModel):
    id: str | None = None
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=2, max_length=2000)
    mandatory: bool = True
    category: str = Field(min_length=2, max_length=40)
    expected_evidence: list[str] = Field(default_factory=list, max_length=20)


class TenderCreate(BaseModel):
    tender_number: str = Field(min_length=2, max_length=100)
    title: str = Field(min_length=3, max_length=200)
    organization: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=5000)
    deadline: datetime | None = None
    status: Literal["draft", "open"] = "draft"
    requirements: list[RequirementInput] = Field(default_factory=list, max_length=100)


class TenderStatusUpdate(BaseModel):
    status: TenderStatus


def _role(user: dict[str, Any]) -> str:
    return str(user.get("role") or "user")


def _can_manage(user: dict[str, Any]) -> None:
    if _role(user) not in {"admin", "reviewer"}:
        raise HTTPException(status_code=403, detail="Tender management requires reviewer or administrator access.")


def _serialize(snapshot: Any) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    for key in ("createdAt", "updatedAt", "deadline"):
        value = data.get(key)
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    data["id"] = snapshot.id
    return data


@router.get("/demo")
def get_demo_tender() -> dict[str, Any]:
    return {
        "id": "TND-DEMO-001",
        "tender_number": "NIRNAY/DEMO/001",
        "title": "Procurement of Industrial Safety Equipment",
        "organization": "NIRNAY Demonstration Authority",
        "description": "Sample tender for demonstrating the intake workflow.",
        "status": "open",
        "requirements": [
            {"id": "REQ-GST", "title": "GST registration", "description": "Provide GST registration evidence.", "mandatory": True, "category": "LEGAL", "expected_evidence": ["GST certificate", "GSTIN"]},
            {"id": "REQ-TURNOVER", "title": "Annual turnover", "description": "Provide audited financial evidence for the required turnover.", "mandatory": True, "category": "FINANCIAL", "expected_evidence": ["audited financial statement", "CA certificate"]},
        ],
        "createdAt": None, "updatedAt": None, "deadline": None,
    }


@router.get("")
def list_tenders(
    status_filter: TenderStatus | None = Query(default=None, alias="status"),
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    query = get_firestore_client().collection("tenders")
    if _role(user) not in {"admin", "reviewer"}:
        query = query.where("status", "==", "open")
    elif status_filter:
        query = query.where("status", "==", status_filter)
    snapshots = query.order_by("createdAt", direction=firestore.Query.DESCENDING).limit(100).stream()
    return {"items": [_serialize(item) for item in snapshots]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tender(body: TenderCreate, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    _can_manage(user)
    db = get_firestore_client()
    existing = list(db.collection("tenders").where("tender_number", "==", body.tender_number.strip()).limit(1).stream())
    if existing:
        raise HTTPException(status_code=409, detail="A tender with this tender number already exists.")
    tender_id = "tnd_" + uuid4().hex
    requirements = []
    for requirement in body.requirements:
        item = requirement.model_dump()
        item["id"] = item["id"] or "req_" + uuid4().hex[:12]
        requirements.append(item)
    data = {
        "tender_number": body.tender_number.strip(), "title": body.title.strip(),
        "organization": body.organization.strip(), "description": body.description.strip(),
        "deadline": body.deadline, "status": body.status, "requirements": requirements,
        "createdBy": user["uid"], "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc), "schemaVersion": 1,
    }
    ref = db.collection("tenders").document(tender_id)
    ref.set(data)
    return _serialize(ref.get())


@router.get("/{tender_id}")
def get_tender(tender_id: str, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    snapshot = get_firestore_client().collection("tenders").document(tender_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Tender not found.")
    data = _serialize(snapshot)
    if data.get("status") != "open" and _role(user) not in {"admin", "reviewer"}:
        raise HTTPException(status_code=404, detail="Tender not found.")
    return data


@router.patch("/{tender_id}/status")
def update_tender_status(tender_id: str, body: TenderStatusUpdate, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    _can_manage(user)
    ref = get_firestore_client().collection("tenders").document(tender_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Tender not found.")
    ref.update({"status": body.status, "updatedAt": datetime.now(timezone.utc), "updatedBy": user["uid"]})
    return _serialize(ref.get())
