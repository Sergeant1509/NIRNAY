
"""Tender-document intake: PDF text extraction with OCR fallback for scanned files."""

import io
import os
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from pypdf import PdfReader
import pypdfium2 as pdfium
import pytesseract

from app.core.security import require_user


# Configure Tesseract explicitly on Windows when it is installed in the
# default directory but has not been added to the Windows PATH.
if os.name == "nt":
    _tesseract_path = Path(
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
    if _tesseract_path.is_file():
        pytesseract.pytesseract.tesseract_cmd = str(_tesseract_path)


router = APIRouter(
    prefix="/api/v1/tender-documents",
    tags=["Tender document extraction"],
)

MAX_BYTES = 15 * 1024 * 1024
MAX_PAGES = 100
MAX_IMAGE_PIXELS = 30_000_000
MAX_TEXT_CHARS = 250_000

ALLOWED = {".pdf", ".png", ".jpg", ".jpeg"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def _clean(value: str) -> str:
    """Normalize whitespace and remove surrounding separators."""
    return re.sub(r"[ \t]+", " ", value).strip(" \t:-")


def _field(text: str, labels: str) -> str:
    """Extract a labeled value from a line of tender text."""
    match = re.search(
        rf"(?im)^\s*(?:{labels})\s*(?:[:\-]|\s{{2,}})\s*(.+?)\s*$",
        text,
    )
    return _clean(match.group(1))[:500] if match else ""


def _extract_text(content: bytes, extension: str) -> tuple[str, str]:
    """Extract PDF text directly or use Tesseract OCR as a fallback."""
    text = ""

    if extension == ".pdf":
        # Reject non-PDF content before attempting to parse it.
        if not content.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=422,
                detail="The uploaded file does not appear to be a valid PDF.",
            )

        try:
            reader = PdfReader(io.BytesIO(content), strict=False)

            if len(reader.pages) > MAX_PAGES:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"Tender PDF exceeds the {MAX_PAGES}-page "
                        "extraction limit."
                    ),
                )

            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=(
                    "This PDF could not be read. Try exporting it "
                    "again as a standard PDF."
                ),
            ) from exc

    # Use OCR for scanned PDFs and image uploads with little extractable text.
    if len(text) < 80:
        tesseract_available = (
            os.path.isfile(pytesseract.pytesseract.tesseract_cmd)
            if os.path.isabs(pytesseract.pytesseract.tesseract_cmd)
            else shutil.which("tesseract") is not None
        )

        if not tesseract_available:
            raise HTTPException(
                status_code=503,
                detail=(
                    "OCR is unavailable. Install Tesseract OCR and ensure "
                    "the backend can locate its executable. Text-based PDFs "
                    "may still be processed without OCR."
                ),
            )

        try:
            if extension == ".pdf":
                document = pdfium.PdfDocument(content)

                if len(document) > MAX_PAGES:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"Tender PDF exceeds the {MAX_PAGES}-page "
                            "OCR limit."
                        ),
                    )

                pages = []

                try:
                    for page in document:
                        bitmap = page.render(scale=1.6)
                        image = bitmap.to_pil()
                        image = ImageOps.grayscale(image)

                        page_text = pytesseract.image_to_string(
                            image,
                            config="--psm 3",
                        )
                        pages.append(page_text)

                    text = "\n".join(pages).strip()
                finally:
                    document.close()

            elif extension in IMAGE_EXTENSIONS:
                with Image.open(io.BytesIO(content)) as source:
                    if source.width * source.height > MAX_IMAGE_PIXELS:
                        raise HTTPException(
                            status_code=413,
                            detail=(
                                "Image dimensions exceed the OCR "
                                "processing limit."
                            ),
                        )

                    source.verify()

                with Image.open(io.BytesIO(content)) as source:
                    image = ImageOps.grayscale(source)
                    text = pytesseract.image_to_string(
                        image,
                        config="--psm 3",
                    ).strip()

            method = "ocr" if text else "none"

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=(
                    "OCR could not read this file. Check that it is clear, "
                    "upright, and not password-protected."
                ),
            ) from exc

    else:
        method = "pdf_text"

    if not text:
        raise HTTPException(
            status_code=422,
            detail="No readable text was found in this document.",
        )

    return text[:MAX_TEXT_CHARS], method


def _extract_fields(text: str) -> dict:
    """Extract draft tender metadata and possible requirement lines."""
    title = _field(
        text,
        r"(?:name|title)\s+of\s+(?:the\s+)?"
        r"(?:work|tender|project)|tender\s+title|subject",
    )

    number = _field(
        text,
        r"(?:tender|bid|nit|rfp|e-?procurement)\s*"
        r"(?:no\.?|number|id|reference)",
    )

    organization = _field(
        text,
        r"(?:name\s+of\s+)?"
        r"(?:procuring|tendering|issuing)\s+"
        r"(?:entity|authority|organization|organisation|department)"
        r"|department\s+name|organization",
    )

    deadline = _field(
        text,
        r"(?:bid|tender)\s+(?:submission\s+)?"
        r"(?:end\s+date|closing\s+date|deadline)"
        r"|submission\s+deadline|deadline|due\s+date"
        r"|last\s+date\s+for\s+(?:submission|bid)",
    )

    emd = _field(
        text,
        r"(?:earnest\s+money\s+deposit|emd\s+amount|bid\s+security)",
    )

    fee = _field(
        text,
        r"(?:tender\s+fee|document\s+fee|cost\s+of\s+tender)",
    )

    requirements = []
    seen = set()

    cues = (
        "eligibility",
        "turnover",
        "gst",
        "experience",
        "solvency",
        "emd",
        "earnest money",
        "technical specification",
        "completion period",
        "audited",
        "certificate",
        "undertaking",
        "license",
        "licence",
        "iso ",
    )

    for line in text.splitlines():
        line = _clean(line)

        if len(line) < 18 or len(line) > 240:
            continue

        lower = line.casefold()

        if any(cue in lower for cue in cues) and lower not in seen:
            seen.add(lower)
            requirements.append(
                {
                    "id": f"ocr-req-{len(requirements) + 1}",
                    "title": line[:120],
                    "description": line[:500],
                    "mandatory": True,
                    "category": "REVIEW",
                    "expected_evidence": [],
                }
            )

            if len(requirements) >= 30:
                break

    key_value_pairs = []

    for line in text.splitlines():
        line = _clean(line)
        match = re.match(r"^([^:：]{2,80})\s*[:：]\s*(.{1,500})$", line)

        if match:
            key_value_pairs.append(
                {
                    "key": _clean(match.group(1)),
                    "value": _clean(match.group(2)),
                }
            )

            if len(key_value_pairs) >= 100:
                break

    return {
        "tender_number": number,
        "title": title,
        "organization": organization,
        "deadline": deadline,
        "emd": emd,
        "tender_fee": fee,
        "requirements": requirements,
        "key_value_pairs": key_value_pairs,
    }


@router.post("/extract")
async def extract_tender_document(
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
) -> dict:
    """Extract draft fields from an uploaded tender PDF or image."""
    filename = Path(file.filename or "tender").name
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED:
        raise HTTPException(
            status_code=415,
            detail="Upload a PDF, PNG, or JPG tender document.",
        )

    try:
        content = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Maximum tender document size is 15 MiB.",
        )

    text, method = _extract_text(content, extension)
    fields = _extract_fields(text)

    return {
        "filename": filename,
        "extraction_method": method,
        "text_characters": len(text),
        "fields": fields,
        "text_preview": text[:4000],
        "normalized_data": {
            "source_filename": filename,
            "source_type": (
                "image" if extension in IMAGE_EXTENSIONS else "document"
            ),
            "key_value_pairs": fields["key_value_pairs"],
            "lines": [
                _clean(line)
                for line in text.splitlines()
                if _clean(line)
            ][:200],
        },
        "review_required": True,
        "disclaimer": (
            "Extraction is a draft. Verify every field and requirement "
            "against the original tender before publishing or making a "
            "bid decision."
        ),
    }
