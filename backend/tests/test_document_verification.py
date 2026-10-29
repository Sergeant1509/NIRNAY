from app.api.document_verification import _checks, _extract_fields


def test_extracts_pan_gstin_and_amount_without_authenticating():
    text = """
    Legal Name: Example Electricals Pvt Ltd
    PAN: ABCDE1234F
    GSTIN: 07ABCDE1234F1Z5
    Turnover: INR 15 lakh
    """
    fields = _extract_fields(text)
    assert fields["pan"] == "ABCDE1234F"
    assert fields["gstin"] == "07ABCDE1234F1Z5"
    assert fields["business_name"] == "Example Electricals Pvt Ltd"
    assert any(item["value_inr"] == 1_500_000 for item in fields["amounts"])


def test_pan_checks_are_not_issuer_verification():
    fields = {"pan": "ABCDE1234F", "gstin": None, "registration_number": None, "business_name": None, "amounts": [], "expiry_date_text": None}
    checks = _checks("pan_card", "PAN ABCDE1234F readable text", fields)
    assert next(item for item in checks if item["code"] == "pan_format")["status"] == "pass"
    assert next(item for item in checks if item["code"] == "issuer_authenticity")["status"] == "not_checked"


def test_missing_gstin_requires_review():
    fields = {"pan": None, "gstin": None, "registration_number": None, "business_name": None, "amounts": [], "expiry_date_text": None}
    checks = _checks("gst_certificate", "Some readable GST certificate text with enough length", fields)
    assert next(item for item in checks if item["code"] == "gstin_format")["status"] == "manual_review"
