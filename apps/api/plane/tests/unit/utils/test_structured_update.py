# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest
from rest_framework.exceptions import ValidationError

from plane.app.serializers.structured_update import (
    StructuredUpdateCorrectionSerializer,
    StructuredUpdateCreateSerializer,
    StructuredUpdateEditSerializer,
)
from plane.utils.structured_update import (
    check_state_gate,
    correction_error,
    editable_fields,
    expected_step_label,
    qa_round_for_next_result,
    target_state_id,
    validate_http_url,
)

pytestmark = pytest.mark.unit


def setting(**kwargs):
    defaults = {
        "enforce_state_gate": True,
        "ready_for_qa_state_id": "qa-gate",
        "ready_for_ba_state_id": "ba-gate",
        "dev_submit_state_id": "ready-qa",
        "qa_passed_state_id": "ready-ba",
        "qa_failed_state_id": "in-progress",
        "ba_approved_state_id": "done",
        "ba_rejected_state_id": "in-progress",
        "ready_for_qa_state": SimpleNamespace(name="Ready for QA"),
        "ready_for_ba_state": SimpleNamespace(name="Ready for BA"),
    }
    return SimpleNamespace(**{**defaults, **kwargs})


def issue(state_id, group="started"):
    return SimpleNamespace(state_id=state_id, state=SimpleNamespace(group=group))


@pytest.mark.parametrize(
    "role,result,expected",
    [
        ("dev", "", "ready-qa"),
        ("qa", "passed", "ready-ba"),
        ("qa", "failed", "in-progress"),
        ("ba", "approved", "done"),
        ("ba", "rejected", "in-progress"),
    ],
)
def test_default_mapping(role, result, expected):
    assert target_state_id(setting(), role, result) == expected


def test_expected_step_labels():
    assert expected_step_label("qa", "passed") == "Ready for BA"
    assert expected_step_label("ba", "approved") == "Done"


@pytest.mark.parametrize(
    "round_,result,rejected,expected",
    [
        (0, None, False, 1),
        (1, "failed", False, 2),
        (3, "failed", False, 4),
        (2, "passed", False, 2),
        (2, "passed", True, 3),
        (1, "failed", True, 2),
    ],
)
def test_qa_round_rules(round_, result, rejected, expected):
    assert qa_round_for_next_result(round_, result, rejected) == expected


def test_gates():
    assert check_state_gate(setting(), "qa", issue("qa-gate")) is None
    assert "Ready for QA" in check_state_gate(setting(), "qa", issue("elsewhere"))
    assert check_state_gate(setting(), "ba", issue("ba-gate")) is None
    assert check_state_gate(setting(enforce_state_gate=False), "ba", issue("elsewhere")) is None
    assert check_state_gate(setting(ready_for_qa_state_id=None), "qa", issue("elsewhere")) is None
    assert check_state_gate(setting(), "dev", issue("anything")) is None
    assert check_state_gate(setting(), "dev", issue("x", group="completed")) is not None
    assert check_state_gate(setting(), "dev", issue("x", group="cancelled")) is not None


@pytest.mark.parametrize("url", ["https://example.com/a?b=1", "http://localhost:3000/x"])
def test_http_urls_accepted(url):
    assert validate_http_url(f"  {url} ") == url


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "ftp://a.b", "//a.b"]
)
def test_other_schemes_rejected(url):
    with pytest.raises(ValidationError):
        validate_http_url(url)


def test_editable_fields_exclude_locked():
    assert editable_fields("dev") == ("root_cause", "resolution", "pr_link")
    assert editable_fields("qa") == ("validation", "testmo_ref")
    assert editable_fields("ba") == ("validation",)


@pytest.mark.parametrize("value", ["", "   ", "\t\n"])
def test_create_serializer_rejects_blank(value):
    serializer = StructuredUpdateCreateSerializer(data={"role": "ba", "result": "approved", "validation": value})
    assert not serializer.is_valid()
    assert "validation" in serializer.errors


def test_edit_serializer_locks_result():
    instance = SimpleNamespace(role="qa", result="passed", root_cause_category="")
    serializer = StructuredUpdateEditSerializer(instance, data={"result": "failed"}, partial=True)
    assert not serializer.is_valid()
    assert "result" in serializer.errors
    serializer = StructuredUpdateEditSerializer(instance, data={"validation": " ok ", "result": "passed"}, partial=True)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {"validation": "ok"}


def update(role="qa", result="failed", category="", actor_id="author", id_="u1"):
    return SimpleNamespace(id=id_, role=role, result=result, root_cause_category=category, actor_id=actor_id)


def test_correction_allows_author_latest_with_different_value():
    assert correction_error(update(), "u1", "author", "passed", "") is None
    assert correction_error(update("ba", "rejected"), "u1", "author", "approved", "") is None
    assert correction_error(update("dev", "", "code"), "u1", "author", "", "config") is None


@pytest.mark.parametrize(
    "original, latest_id, user_id, result, category, message",
    [
        (update(), "u1", "someone-else", "passed", "", "Only the author"),
        (update(), "u2", "author", "passed", "", "most recent update"),
        (update(), "u1", "author", "failed", "", "different result"),
        (update(), "u1", "author", "approved", "", "Choose one of"),
        (update("dev", "", "code"), "u1", "author", "", "code", "different root cause"),
        (update("dev", "", "code"), "u1", "author", "", "bogus", "Choose one of"),
    ],
)
def test_correction_rejected(original, latest_id, user_id, result, category, message):
    assert message in correction_error(original, latest_id, user_id, result, category)


@pytest.mark.parametrize("reason", ["", "   "])
def test_correction_requires_reason(reason):
    serializer = StructuredUpdateCorrectionSerializer(data={"result": "passed", "reason": reason})
    assert not serializer.is_valid()
    assert "reason" in serializer.errors
