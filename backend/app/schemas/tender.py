from pydantic import BaseModel
from typing import List, Optional


class Requirement(BaseModel):
    id: str
    title: str
    description: str
    mandatory: bool = True
    category: str
    expected_evidence: List[str]


class Document(BaseModel):
    id: str
    filename: str
    document_type: str
    status: str = "uploaded"


class Bidder(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    documents: List[Document] = []


class Tender(BaseModel):
    id: str
    tender_number: str
    title: str
    organization: str
    status: str
    requirements: List[Requirement]
    bidders: List[Bidder] = []