"""Versioned tender rule sets with explicit reviewer approval and audit history."""
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.firebase import get_firestore_client
from app.core.security import require_user
from app.services.rule_engine import ALLOWED_TYPES, evaluate_rules

router = APIRouter(prefix="/api/v1/tenders", tags=["Tender rules"])


class RuleInput(BaseModel):
    rule_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=3000)
    rule_type: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    condition: dict[str, Any] = Field(default_factory=dict)
    required_evidence: list[str] = Field(default_factory=list, max_length=30)
    source_reference: dict[str, Any] = Field(default_factory=dict)
    severity: Literal["mandatory", "conditional", "advisory"] = "mandatory"
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("rule_type")
    @classmethod
    def supported_rule_type(cls, value: str) -> str:
        if value not in ALLOWED_TYPES:
            raise ValueError(f"rule_type must be one of: {', '.join(sorted(ALLOWED_TYPES))}")
        return value


class RuleSetCreate(BaseModel):
    name: str = Field(default="Tender rule set", min_length=2, max_length=160)
    rules: list[RuleInput] = Field(default_factory=list, max_length=200)
    source_document: dict[str, Any] = Field(default_factory=dict)
    change_summary: str = Field(default="", max_length=2000)


class RuleEvaluationInput(BaseModel):
    evidence: dict[str, Any] = Field(default_factory=dict)


def _role(user: dict[str, Any]) -> str:
    return str(user.get("role") or "user")


def _require_reviewer(user: dict[str, Any]) -> None:
    if _role(user) not in {"admin", "reviewer"}:
        raise HTTPException(status_code=403, detail="Tender rule management requires reviewer or administrator access.")


def _serialize(snapshot: Any) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    for key in ("createdAt", "updatedAt", "approvedAt", "supersededAt"):
        value = data.get(key)
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    data["id"] = snapshot.id
    return data


def _tender_or_404(tender_id: str) -> tuple[Any, Any]:
    db = get_firestore_client()
    ref = db.collection("tenders").document(tender_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Tender not found.")
    return db, ref


@router.get("/{tender_id}/rule-sets")
def list_rule_sets(tender_id: str, user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    db, tender_ref = _tender_or_404(tender_id)
    tender = tender_ref.get().to_dict() or {}
    reviewer = _role(user) in {"admin", "reviewer"}
    if tender.get("status") != "open" and not reviewer:
        raise HTTPException(status_code=404, detail="Tender not found.")
    items = [
        _serialize(item)
        for item in db.collection("tender_rule_sets").where("tenderId", "==", tender_id).stream()
    ]
    if not reviewer:
        items = [item for item in items if item.get("status") == "approved"]
    items.sort(key=lambda item: item.get("version", 0), reverse=True)
    return {"items": items, "active_rule_set_id": tender.get("activeRuleSetId")}


@router.post("/{tender_id}/rule-sets", status_code=status.HTTP_201_CREATED)
def create_rule_set(
    tender_id: str, body: RuleSetCreate, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    _require_reviewer(user)
    db, tender_ref = _tender_or_404(tender_id)
    existing = list(db.collection("tender_rule_sets").where("tenderId", "==", tender_id).stream())
    version = max([int((item.to_dict() or {}).get("version", 0)) for item in existing] + [0]) + 1
    now = datetime.now(timezone.utc)
    rule_set_id = "trs_" + uuid4().hex
    data = {
        "tenderId": tender_id,
        "name": body.name.strip(),
        "version": version,
        "status": "draft",
        "rules": [rule.model_dump() for rule in body.rules],
        "sourceDocument": body.source_document,
        "changeSummary": body.change_summary.strip(),
        "createdBy": user["uid"],
        "createdAt": now,
        "updatedAt": now,
        "approvedBy": None,
        "approvedAt": None,
        "schemaVersion": 1,
    }
    db.collection("tender_rule_sets").document(rule_set_id).set(data)
    tender_ref.update({"updatedAt": now})
    db.collection("admin_audit_logs").add({
        "actorUid": user["uid"], "actorEmail": user.get("email"),
        "action": "tender.ruleset.created", "targetUid": tender_id,
        "details": {"ruleSetId": rule_set_id, "version": version, "ruleCount": len(body.rules)},
        "createdAt": now,
    })
    return _serialize(db.collection("tender_rule_sets").document(rule_set_id).get())


@router.post("/{tender_id}/rule-sets/{rule_set_id}/approve")
def approve_rule_set(
    tender_id: str, rule_set_id: str, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    _require_reviewer(user)
    db, tender_ref = _tender_or_404(tender_id)
    collection = db.collection("tender_rule_sets")
    ref = collection.document(rule_set_id)
    snapshot = ref.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("tenderId") != tender_id:
        raise HTTPException(status_code=404, detail="Rule set not found for this tender.")
    rule_set = snapshot.to_dict() or {}
    if rule_set.get("status") != "draft":
        raise HTTPException(status_code=409, detail="Only draft rule sets can be approved. Create a new version to change approved rules.")
    if not rule_set.get("rules"):
        raise HTTPException(status_code=422, detail="Add at least one rule before approval.")
    now = datetime.now(timezone.utc)
    for item in collection.where("tenderId", "==", tender_id).stream():
        data = item.to_dict() or {}
        if data.get("status") == "approved":
            item.reference.update({"status": "superseded", "supersededAt": now})
    ref.update({"status": "approved", "approvedBy": user["uid"], "approvedAt": now, "updatedAt": now})
    tender_ref.update({"activeRuleSetId": rule_set_id, "updatedAt": now})
    db.collection("admin_audit_logs").add({
        "actorUid": user["uid"], "actorEmail": user.get("email"),
        "action": "tender.ruleset.approved", "targetUid": tender_id,
        "details": {"ruleSetId": rule_set_id, "version": rule_set.get("version")},
        "createdAt": now,
    })
    return _serialize(ref.get())


@router.post("/{tender_id}/rule-sets/{rule_set_id}/evaluate")
def evaluate_rule_set(
    tender_id: str, rule_set_id: str, body: RuleEvaluationInput,
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    # This endpoint accepts caller-supplied facts and is a reviewer sandbox, not a bidder decision API.
    _require_reviewer(user)
    db, tender_ref = _tender_or_404(tender_id)
    tender = tender_ref.get().to_dict() or {}
    reviewer = _role(user) in {"admin", "reviewer"}
    if tender.get("status") != "open" and not reviewer:
        raise HTTPException(status_code=404, detail="Tender not found.")
    ref = db.collection("tender_rule_sets").document(rule_set_id)
    snapshot = ref.get()
    if not snapshot.exists or (snapshot.to_dict() or {}).get("tenderId") != tender_id:
        raise HTTPException(status_code=404, detail="Rule set not found for this tender.")
    rule_set = snapshot.to_dict() or {}
    if rule_set.get("status") != "approved" and not reviewer:
        raise HTTPException(status_code=409, detail="Only an approved rule set can be used for bidder evaluation.")
    result = evaluate_rules(rule_set.get("rules", []), body.evidence)
    result.update({
        "tender_id": tender_id,
        "rule_set_id": rule_set_id,
        "rule_set_version": rule_set.get("version"),
        "created_by": user["uid"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.collection("tender_rule_evaluations").add(result)
    return result
