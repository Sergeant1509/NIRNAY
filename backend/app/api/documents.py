import os
import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from firebase_admin import firestore, storage

from app.core.firebase import get_firebase_app, get_firestore_client
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])
MAX_BYTES = 15 * 1024 * 1024
ALLOWED = {".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".txt"}


def docs_for(uid: str):
    return get_firestore_client().collection("users").document(uid).collection("documents")


def clean_filename(value: str | None) -> str:
    name = (value or "upload").replace(chr(92), "/").split("/")[-1]
    name = re.sub(r"[\r\n\x00]", "", name).strip()
    return (name or "upload")[:180]


def serialize(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    created = data.get("createdAt")
    return {
        "id": snapshot.id,
        "filename": data.get("filename", ""),
        "content_type": data.get("contentType", "application/octet-stream"),
        "size_bytes": data.get("sizeBytes", 0),
        "created_at": created.isoformat() if isinstance(created, datetime) else None,
    }


def get_bucket():
    try:
        return storage.bucket(
            name=os.getenv("FIREBASE_STORAGE_BUCKET") or None,
            app=get_firebase_app(),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Firebase Storage is not configured. On the free Spark plan, use another file-storage provider or enable the required billing plan.",
        ) from exc


@router.get("")
def list_documents(user: dict[str, Any] = Depends(require_user)) -> list[dict[str, Any]]:
    query = docs_for(user["uid"]).order_by("createdAt", direction=firestore.Query.DESCENDING)
    return [serialize(item) for item in query.stream()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    filename = clean_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=415, detail="Allowed file types: PDF, PNG/JPG, DOCX, XLSX, TXT.")

    content = await file.read(MAX_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Maximum upload size is 15 MiB.")

    mime = (file.content_type or "application/octet-stream").split(";", 1)[0]
    if mime == "application/octet-stream":
        mime = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".txt": "text/plain",
        }.get(ext, mime)

    uid = user["uid"]
    document_id = uuid.uuid4().hex
    object_path = f"users/{uid}/documents/{document_id}/{filename}"
    bucket = get_bucket()
    blob = bucket.blob(object_path)
    blob.metadata = {"ownerUid": uid, "documentId": document_id}
    blob.cache_control = "private, max-age=0, no-transform"

    try:
        blob.upload_from_string(content, content_type=mime)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="File could not be stored in Firebase Storage. Confirm Storage is enabled and the project plan supports it.",
        ) from exc

    ref = docs_for(uid).document(document_id)
    try:
        ref.set({
            "filename": filename,
            "contentType": mime,
            "sizeBytes": len(content),
            "objectPath": object_path,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return serialize(ref.get())
    except Exception as exc:
        try:
            blob.delete()
        except Exception:
            pass
        raise HTTPException(status_code=503, detail="File uploaded but its metadata could not be saved to Firestore.") from exc


@router.get("/{document_id}/download")
def download_document(document_id: str, user: dict[str, Any] = Depends(require_user)) -> Response:
    ref = docs_for(user["uid"]).document(document_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found.")
    item = snapshot.to_dict() or {}
    path = item.get("objectPath")
    if not path or not path.startswith(f"users/{user['uid']}/documents/"):
        raise HTTPException(status_code=403, detail="Document access denied.")

    try:
        data = get_bucket().blob(path).download_as_bytes()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="File could not be retrieved from Storage.") from exc

    filename = clean_filename(item.get("filename"))
    ascii_name = filename.encode("ascii", errors="ignore").decode("ascii").replace('"', "") or "download"
    return Response(
        content=data,
        media_type=item.get("contentType", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_name}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, user: dict[str, Any] = Depends(require_user)) -> Response:
    ref = docs_for(user["uid"]).document(document_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found.")
    path = (snapshot.to_dict() or {}).get("objectPath")
    if not path or not path.startswith(f"users/{user['uid']}/documents/"):
        raise HTTPException(status_code=403, detail="Document access denied.")

    try:
        get_bucket().blob(path).delete()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="File could not be deleted from Storage.") from exc
    ref.delete()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
