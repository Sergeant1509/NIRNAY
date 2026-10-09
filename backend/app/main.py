from fastapi import FastAPI

from app.api.tenders import router as tender_router


app = FastAPI(
    title="NIRNAY",
    description="Procurement Compliance & Verification System",
    version="0.1.0",
)

app.include_router(tender_router)


@app.get("/")
def root():
    return {
        "project": "NIRNAY",
        "status": "Backend is running",
    }