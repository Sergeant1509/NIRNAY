import os
from functools import lru_cache
import time

import cloudinary
import cloudinary.uploader
from cloudinary.utils import private_download_url
from dotenv import load_dotenv

load_dotenv()


@lru_cache(maxsize=1)
def configure_cloudinary():
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")

    if not all([cloud_name, api_key, api_secret]):
        raise RuntimeError(
            "Cloudinary is not configured. Check the backend .env file."
        )

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )

    return cloudinary.config()


def upload_file(content: bytes, public_id: str) -> dict:
    configure_cloudinary()

    return cloudinary.uploader.upload(
        content,
        resource_type="raw",
        type="authenticated",
        public_id=public_id,
        overwrite=False,
        unique_filename=False,
    )


def get_signed_download_url(public_id: str) -> str:
    """Create a short-lived server-to-server download URL for an authenticated raw asset."""
    configure_cloudinary()
    extension = public_id.rsplit(".", 1)[-1].lower() if "." in public_id.rsplit("/", 1)[-1] else ""
    if not extension:
        raise ValueError("Cloudinary raw asset public ID is missing its file extension.")

    return private_download_url(
        public_id,
        extension,
        resource_type="raw",
        type="authenticated",
        expires_at=int(time.time()) + 300,
    )


def delete_file(public_id: str) -> dict:
    configure_cloudinary()

    result = cloudinary.uploader.destroy(
        public_id,
        resource_type="raw",
        type="authenticated",
        invalidate=True,
    )

    if result.get("result") != "ok":
        raise RuntimeError(
            f"Cloudinary could not delete the file: {result.get('result')}"
        )

    return result