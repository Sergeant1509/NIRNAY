import os
import re
import uuid
from datetime import datetime
from typing import Any
from urllib.request import Request, urlopen

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from firebase_admin import firestore

from app.core.cloudinary_storage import (
    configure_cloudinary,
    delete_file,
    get_signed_download_url,
    upload_file,
)
from app.core.firebase import get_firestore_client
from app.core.security import require_user

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])

MAX_BYTES = 15 * 1024 * 1024

ALLOWED = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".docx",
    ".xlsx",
    ".txt",
}

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
    ".txt": "text/plain",
}


def docs_for(uid: str):
    return (
        get_firestore_client()
        .collection("users")
        .document(uid)
        .collection("documents")
    )


def clean_filename(value: str | None) -> str:
    name = (value or "upload").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\r\n\x00]", "", name).strip()
    return (name or "upload")[:180]


def serialize(snapshot) -> dict[str, Any]:
    data = snapshot.to_dict() or {}
    created = data.get("createdAt")

    return {
        "id": snapshot.id,
        "filename": data.get("filename", ""),
        "content_type": data.get(
            "contentType",
            "application/octet-stream",
        ),
        "size_bytes": data.get("sizeBytes", 0),
        "created_at": (
            created.isoformat()
            if isinstance(created, datetime)
            else None
        ),
    }


def get_cloudinary_public_id(item: dict[str, Any]) -> str:
    """
    Return the Cloudinary asset identifier.

    Documents previously stored in Firebase Storage are not
    automatically migrated by this integration.
    """
    public_id = item.get("cloudinaryPublicId")

    if not public_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This document uses the previous storage system. "
                "Download or re-upload it before removing the old copy."
            ),
        )

    return public_id


@router.get("")
def list_documents(
    user: dict[str, Any] = Depends(require_user),
) -> list[dict[str, Any]]:
    query = docs_for(user["uid"]).order_by(
        "createdAt",
        direction=firestore.Query.DESCENDING,
    )

    return [serialize(item) for item in query.stream()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    filename = clean_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=(
                "Allowed file types: PDF, PNG/JPG, DOCX, XLSX, TXT."
            ),
        )

    content = await file.read(MAX_BYTES + 1)
    await file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Maximum upload size is 15 MiB.",
        )

    # Use the expected MIME type for the accepted extension.
    # The browser-supplied MIME type is not trusted.
    mime = MIME_TYPES[ext]

    uid = user["uid"]
    document_id = uuid.uuid4().hex

    # Generate the Cloudinary ID on the server.
    # Include the extension because this is a raw asset.
    public_id = (
        f"nirnay/{uid}/documents/{document_id}{ext}"
    )

    # Upload to Cloudinary before creating the Firestore metadata.
    try:
        configure_cloudinary()
        upload_file(content, public_id)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Cloudinary could not store the document.",
        ) from exc

    ref = docs_for(uid).document(document_id)

    try:
        ref.set(
            {
                "filename": filename,
                "contentType": mime,
                "sizeBytes": len(content),
                "cloudinaryPublicId": public_id,
                "storageProvider": "cloudinary",
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )

        return serialize(ref.get())

    except Exception as exc:
        # Best-effort cleanup if Firestore metadata cannot be saved.
        try:
            delete_file(public_id)
        except Exception:
            pass

        raise HTTPException(
            status_code=503,
            detail=(
                "The file was uploaded, but its metadata could "
                "not be saved. Please retry."
            ),
        ) from exc


@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    user: dict[str, Any] = Depends(require_user),
) -> Response:
    # Look up the document only inside the authenticated user's
    # Firestore collection.
    ref = docs_for(user["uid"]).document(document_id)
    snapshot = ref.get()

    if not snapshot.exists:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    item = snapshot.to_dict() or {}
    public_id = get_cloudinary_public_id(item)

    try:
        # Generate the signed URL on the backend. Never send the
        # Cloudinary API secret to the frontend.
        signed_url = get_signed_download_url(public_id)

        request = Request(
            signed_url,
            headers={"User-Agent": "NIRNAY/1.0"},
        )

        with urlopen(request, timeout=30) as remote:
            content = remote.read(MAX_BYTES + 1)

        if len(content) > MAX_BYTES:
            raise HTTPException(
                status_code=502,
                detail="The stored file exceeds the permitted size.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The document could not be retrieved from Cloudinary.",
        ) from exc

    filename = clean_filename(item.get("filename"))
    ascii_name = (
        filename.encode("ascii", errors="ignore")
        .decode("ascii")
        .replace('"', "")
        or "download"
    )

    return Response(
        content=content,
        media_type=item.get(
            "contentType",
            "application/octet-stream",
        ),
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"'
            ),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_document(
    document_id: str,
    user: dict[str, Any] = Depends(require_user),
) -> Response:
    ref = docs_for(user["uid"]).document(document_id)
    snapshot = ref.get()

    if not snapshot.exists:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    item = snapshot.to_dict() or {}
    public_id = get_cloudinary_public_id(item)

    # Delete the Cloudinary asset before deleting its metadata.
    try:
        delete_file(public_id)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The document could not be deleted from Cloudinary.",
        ) from exc

    try:
        ref.delete()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The file was deleted from Cloudinary, but its "
                "Firestore metadata could not be removed."
            ),
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)