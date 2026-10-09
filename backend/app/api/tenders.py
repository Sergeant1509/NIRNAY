from fastapi import APIRouter

from app.schemas.tender import (
    Tender,
    Requirement,
    Bidder,
    Document,
)

router = APIRouter(
    prefix="/api/v1/tenders",
    tags=["Tenders"],
)


@router.get("/demo", response_model=Tender)
def get_demo_tender():
    return Tender(
        id="TND-001",
        tender_number="CPCL/PROC/2026/001",
        title="Procurement of Industrial Safety Equipment",
        organization="Chennai Petroleum Corporation Limited",
        status="UNDER_VERIFICATION",
        requirements=[
            Requirement(
                id="REQ-001",
                title="Valid GST Registration",
                description="Bidder must provide a valid GST registration certificate.",
                mandatory=True,
                category="LEGAL",
                expected_evidence=[
                    "GST Certificate",
                    "GSTIN",
                ],
            ),
            Requirement(
                id="REQ-002",
                title="Minimum Annual Turnover",
                description="Bidder must demonstrate the required minimum annual turnover.",
                mandatory=True,
                category="FINANCIAL",
                expected_evidence=[
                    "Audited Financial Statement",
                    "CA Certificate",
                ],
            ),
            Requirement(
                id="REQ-003",
                title="Technical Experience",
                description="Bidder must demonstrate relevant experience in supplying industrial equipment.",
                mandatory=True,
                category="TECHNICAL",
                expected_evidence=[
                    "Work Order",
                    "Completion Certificate",
                ],
            ),
        ],
        bidders=[
            Bidder(
                id="BID-001",
                name="ABC Industrial Solutions Pvt. Ltd.",
                email="procurement@abcindustrial.example",
                documents=[
                    Document(
                        id="DOC-001",
                        filename="GST_Certificate.pdf",
                        document_type="GST_CERTIFICATE",
                    ),
                    Document(
                        id="DOC-002",
                        filename="Audited_Financials_2025.pdf",
                        document_type="FINANCIAL_STATEMENT",
                    ),
                ],
            )
        ],
    )