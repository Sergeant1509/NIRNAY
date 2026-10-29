"""Deterministic evaluation for reviewer-approved, versioned tender rules.

Rules are data, not Python expressions. Never eval rule text or execute tender-supplied code.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

ALLOWED_TYPES = {"numeric_threshold", "document_presence", "value_match", "alternative_group"}
NUMERIC_OPERATORS = {">=", ">", "<=", "<", "==", "!="}
CONDITION_OPERATORS = {"==", "!=", "in", "not_in", "contains"}


def _number(value: Any) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return None


def _result(rule: dict[str, Any], outcome: str, reason: str, **extra: Any) -> dict[str, Any]:
    return {
        "rule_id": str(rule.get("rule_id") or rule.get("id") or "unnamed"),
        "title": str(rule.get("title") or "Untitled requirement"),
        "rule_type": rule.get("rule_type", "unknown"),
        "outcome": outcome,
        "reason": reason,
        "source_reference": rule.get("source_reference") or {},
        **extra,
    }


def _condition_applies(condition: Any, evidence: dict[str, Any]) -> tuple[bool | None, str]:
    if not condition:
        return True, ""
    if not isinstance(condition, dict):
        return None, "Rule condition must be an object."
    field, operator, expected = condition.get("field"), condition.get("operator"), condition.get("value")
    if not isinstance(field, str) or operator not in CONDITION_OPERATORS:
        return None, "Condition requires a field and a supported operator."
    actual = evidence.get(field)
    if actual is None:
        return None, f"Evidence needed to evaluate condition '{field}' is missing."
    if operator == "==":
        result = str(actual).strip().casefold() == str(expected).strip().casefold()
    elif operator == "!=":
        result = str(actual).strip().casefold() != str(expected).strip().casefold()
    elif operator == "in":
        if not isinstance(expected, list):
            return None, "The 'in' condition requires a list value."
        result = str(actual).strip().casefold() in {str(item).strip().casefold() for item in expected}
    elif operator == "not_in":
        if not isinstance(expected, list):
            return None, "The 'not_in' condition requires a list value."
        result = str(actual).strip().casefold() not in {str(item).strip().casefold() for item in expected}
    else:
        result = isinstance(actual, (list, str)) and (
            str(expected).casefold() in actual.casefold() if isinstance(actual, str)
            else any(str(expected).casefold() == str(item).casefold() for item in actual)
        )
    return result, ""


def evaluate_rule(rule: dict[str, Any], evidence: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    """Evaluate one structured rule against reviewer-supplied, extracted evidence.

    Missing/ambiguous evidence yields needs_review. A pass means the provided
    structured evidence satisfies the configured comparison; it is not legal advice.
    """
    if depth > 8:
        return _result(rule, "needs_review", "Rule nesting exceeds the supported depth.")
    kind = rule.get("rule_type")
    params = rule.get("parameters") or {}
    if kind not in ALLOWED_TYPES:
        return _result(rule, "needs_review", "Unsupported or missing rule type.")
    if not isinstance(params, dict):
        return _result(rule, "needs_review", "Rule parameters must be an object.")

    applies, condition_reason = _condition_applies(rule.get("condition"), evidence)
    if applies is None:
        return _result(rule, "needs_review", condition_reason)
    if not applies:
        return _result(rule, "not_applicable", "The configured condition is not met; this rule does not apply.")

    if kind == "numeric_threshold":
        field = params.get("field")
        operator = params.get("operator")
        target = _number(params.get("value"))
        actual = _number(evidence.get(field)) if isinstance(field, str) else None
        if not field or operator not in NUMERIC_OPERATORS or target is None:
            return _result(rule, "needs_review", "Numeric rule configuration is incomplete or invalid.")
        if actual is None:
            return _result(rule, "needs_review", f"No valid numeric evidence was supplied for '{field}'.", field=field)
        passed = {
            ">=": actual >= target, ">": actual > target, "<=": actual <= target,
            "<": actual < target, "==": actual == target, "!=": actual != target,
        }[operator]
        return _result(
            rule, "pass" if passed else "fail",
            f"Evidence value {actual} {operator} required value {target}." if passed
            else f"Evidence value {actual} does not satisfy {operator} {target}.",
            field=field, actual=str(actual), operator=operator, expected=str(target),
        )

    if kind == "document_presence":
        document_type = params.get("document_type")
        documents = evidence.get("documents", [])
        if not isinstance(document_type, str) or not isinstance(documents, list):
            return _result(rule, "needs_review", "Document rule requires document_type and a documents list.")
        found = any(
            isinstance(item, dict) and str(item.get("document_type", "")).casefold() == document_type.casefold()
            for item in documents
        )
        return _result(
            rule, "pass" if found else ("fail" if params.get("missing_is_fail") is True else "needs_review"),
            f"Evidence list {'contains' if found else 'does not contain'} document type '{document_type}'.",
            document_type=document_type,
        )

    if kind == "value_match":
        field = params.get("field")
        expected = params.get("accepted_values")
        actual = evidence.get(field) if isinstance(field, str) else None
        if not field or not isinstance(expected, list) or not expected:
            return _result(rule, "needs_review", "Value-match rule requires a field and non-empty accepted_values.")
        if actual is None or not str(actual).strip():
            return _result(rule, "needs_review", f"No evidence value was supplied for '{field}'.", field=field)
        matched = str(actual).strip().casefold() in {str(item).strip().casefold() for item in expected}
        return _result(
            rule, "pass" if matched else "fail",
            f"Value for '{field}' matches an accepted value." if matched
            else f"Value for '{field}' does not match any configured accepted value.",
            field=field, actual=str(actual), accepted_values=expected,
        )

    alternatives = params.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives:
        return _result(rule, "needs_review", "Alternative group requires a non-empty alternatives list.")
    evaluated = []
    for index, alternative in enumerate(alternatives):
        if not isinstance(alternative, list) or not alternative or not all(isinstance(child, dict) for child in alternative):
            evaluated.append({"alternative": index + 1, "outcome": "needs_review", "findings": [], "reason": "Alternative must be a non-empty list of rules."})
            continue
        findings = [evaluate_rule(child, evidence, depth + 1) for child in alternative]
        outcomes = [item["outcome"] for item in findings if item["outcome"] != "not_applicable"]
        outcome = "not_applicable" if not outcomes else (
            "pass" if all(value == "pass" for value in outcomes) else (
                "fail" if all(value == "fail" for value in outcomes) else "needs_review"
            )
        )
        evaluated.append({"alternative": index + 1, "outcome": outcome, "findings": findings})
    applicable = [item["outcome"] for item in evaluated if item["outcome"] != "not_applicable"]
    outcome = "not_applicable" if not applicable else (
        "pass" if any(value == "pass" for value in applicable) else (
            "fail" if all(value == "fail" for value in applicable) else "needs_review"
        )
    )
    return _result(
        rule, outcome,
        "At least one alternative is satisfied." if outcome == "pass" else (
            "All alternatives failed." if outcome == "fail" else (
                "No alternative applies." if outcome == "not_applicable"
                else "The alternative group cannot be decided from the supplied evidence."
            )
        ),
        alternatives=evaluated,
    )


def evaluate_rules(rules: list[dict[str, Any]], evidence: dict[str, Any]) -> dict[str, Any]:
    findings = [evaluate_rule(rule, evidence) for rule in rules]
    outcomes = [item["outcome"] for item in findings if item["outcome"] != "not_applicable"]
    status = "pass" if outcomes and all(value == "pass" for value in outcomes) else (
        "fail" if "fail" in outcomes else ("not_applicable" if not outcomes and findings else "needs_review")
    )
    return {
        "status": status,
        "findings": findings,
        "method": "deterministic_rule_evaluation_v1",
        "disclaimer": "Results evaluate only the supplied structured evidence against the approved rule configuration. They do not verify document authenticity, signatures, registry status, or legal compliance. Human review is required.",
    }
