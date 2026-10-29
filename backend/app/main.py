from dotenv import load_dotenv

# Load backend/.env when the server is started from backend/.
load_dotenv()

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.tenders import router as tender_router
from app.api.tender_document_extraction import router as tender_document_extraction_router
from app.api.document_verification import router as document_verification_router
from app.api.tender_rules import router as tender_rules_router
from app.api.applications import router as applications_router
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.records import router as records_router
from app.api.documents import router as documents_router
from app.api.notifications import router as notifications_router

app = FastAPI(
    title="NIRNAY",
    description="Procurement Compliance & Verification System",
    version="0.5.0",
)
origins = [
    item.strip()
    for item in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(tender_router)
app.include_router(tender_document_extraction_router)
app.include_router(document_verification_router)
app.include_router(tender_rules_router)
app.include_router(applications_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(records_router)
app.include_router(documents_router)
app.include_router(notifications_router)


@app.get("/healthz", tags=["Health"])
def health():
    return {"project": "NIRNAY", "status": "ok"}


@app.get("/", tags=["Health"])
def root():
    return {"project": "NIRNAY", "status": "Backend is running"}
