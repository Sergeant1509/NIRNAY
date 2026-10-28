from app.api.tender_document_extraction import _clean, _extract_fields


def test_clean_collapses_horizontal_whitespace():
    assert _clean("  Tender   title:  Example Project  ") == "Tender title: Example Project"


def test_extracts_common_tender_fields_and_key_value_pairs():
    text = """
Tender No: ABC/2026/17
Tender Title: Supply of Safety Equipment
Organization: Public Works Department
EMD Amount: Rs. 25,000
Tender Fee: Rs. 1,000
Eligibility: Bidder must have five years of experience.
GST Registration: Valid GST certificate required.
"""
    fields = _extract_fields(text)
    assert fields["tender_number"] == "ABC/2026/17"
    assert fields["title"] == "Supply of Safety Equipment"
    assert fields["organization"] == "Public Works Department"
    assert fields["emd"] == "Rs. 25,000"
    assert fields["tender_fee"] == "Rs. 1,000"
    assert len(fields["requirements"]) >= 2
    pairs = {item["key"]: item["value"] for item in fields["key_value_pairs"]}
    assert pairs["Tender No"] == "ABC/2026/17"
    assert pairs["Tender Title"] == "Supply of Safety Equipment"


def test_missing_fields_are_empty_not_guessed():
    fields = _extract_fields("A document with no recognizable tender metadata.")
    assert fields["tender_number"] == ""
    assert fields["title"] == ""
    assert fields["organization"] == ""
    assert fields["deadline"] == ""
    assert fields["emd"] == ""
    assert fields["tender_fee"] == ""
    assert fields["requirements"] == []


def test_requirement_lines_are_deduplicated():
    text = "Eligibility: bidder needs experience.\nEligibility: bidder needs experience."
    fields = _extract_fields(text)
    assert len(fields["requirements"]) == 1
