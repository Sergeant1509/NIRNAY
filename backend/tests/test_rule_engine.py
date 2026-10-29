from app.services.rule_engine import evaluate_rule, evaluate_rules


def rule(rule_type, parameters, rule_id="r1", condition=None):
    return {"rule_id": rule_id, "title": "Example rule", "rule_type": rule_type, "parameters": parameters, "condition": condition or {}}


def test_numeric_threshold_pass_and_fail():
    configured = rule("numeric_threshold", {"field": "turnover_inr", "operator": ">=", "value": 1365000})
    assert evaluate_rule(configured, {"turnover_inr": 1400000})["outcome"] == "pass"
    assert evaluate_rule(configured, {"turnover_inr": 1000000})["outcome"] == "fail"


def test_missing_numeric_evidence_needs_review():
    configured = rule("numeric_threshold", {"field": "turnover", "operator": ">=", "value": 100})
    assert evaluate_rule(configured, {})["outcome"] == "needs_review"


def test_document_presence_is_case_insensitive():
    configured = rule("document_presence", {"document_type": "GST Certificate"})
    result = evaluate_rule(configured, {"documents": [{"document_type": "gst certificate"}]})
    assert result["outcome"] == "pass"


def test_value_match_uses_case_insensitive_exact_values():
    configured = rule("value_match", {"field": "bidder_type", "accepted_values": ["Manufacturer", "Licensed contractor"]})
    assert evaluate_rule(configured, {"bidder_type": "manufacturer"})["outcome"] == "pass"
    assert evaluate_rule(configured, {"bidder_type": "reseller"})["outcome"] == "fail"


def test_alternative_group_passes_when_one_complete_route_passes():
    configured = rule("alternative_group", {"alternatives": [
        [rule("numeric_threshold", {"field": "works_count", "operator": ">=", "value": 3}, "a1")],
        [rule("numeric_threshold", {"field": "works_count", "operator": ">=", "value": 1}, "a2")],
    ]})
    assert evaluate_rule(configured, {"works_count": 1})["outcome"] == "pass"


def test_conditional_rule_is_not_applicable_when_condition_is_false():
    configured = rule("document_presence", {"document_type": "A-class licence"}, condition={"field": "bidder_type", "operator": "==", "value": "contractor"})
    result = evaluate_rule(configured, {"bidder_type": "manufacturer", "documents": []})
    assert result["outcome"] == "not_applicable"


def test_unknown_condition_evidence_needs_review():
    configured = rule("numeric_threshold", {"field": "turnover", "operator": ">=", "value": 100}, condition={"field": "bidder_type", "operator": "==", "value": "contractor"})
    assert evaluate_rule(configured, {"turnover": 200})["outcome"] == "needs_review"


def test_rule_set_result_does_not_claim_compliance_when_evidence_is_missing():
    result = evaluate_rules([rule("numeric_threshold", {"field": "turnover", "operator": ">=", "value": 100})], {})
    assert result["status"] == "needs_review"
    assert "Human review is required" in result["disclaimer"]


def test_empty_rule_set_needs_review():
    assert evaluate_rules([], {})["status"] == "needs_review"
