import os
from functools import lru_cache

import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url
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
    configure_cloudinary()

    url, _ = cloudinary_url(
        public_id,
        resource_type="raw",
        type="authenticated",
        sign_url=True,
        secure=True,
    )

    return url


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