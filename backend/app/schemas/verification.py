from pydantic import BaseModel
from typing import Optional


class VerificationResult(BaseModel):
    requirement_id: str
    bidder_id: str
    status: str
    confidence: Optional[float] = None
    reason: str
    evidence: Optional[str] = None