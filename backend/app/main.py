from fastapi import FastAPI

app = FastAPI(
    title="NIRNAY",
    description="Procurement Compliance & Verification System",
    version="0.1.0"
)


@app.get("/")
def root():
    return {
        "project": "NIRNAY",
        "status": "Backend is running"
    }