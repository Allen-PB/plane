from uuid import uuid4

import pytest

from plane.app.views.workspace.bulk_update import BulkUpdateEndpoint, OperationSerializer
from types import SimpleNamespace
from unittest.mock import patch
from plane.utils.bulk_update import replace_project_urls
from plane.utils.bulk_update_fields import parent_chain, validate_dates
from datetime import date
from rest_framework.exceptions import ValidationError

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("method", ["get", "post"])
def test_workspace_admin_guard_needs_no_project_route(method):
    request = SimpleNamespace(user=SimpleNamespace(id=uuid4()))
    with patch("plane.app.permissions.base.WorkspaceMember.objects.filter") as membership:
        membership.return_value.exists.return_value = False
        response = getattr(BulkUpdateEndpoint(), method)(request, slug="sync")
    assert response.status_code == 403
    assert membership.call_args.kwargs["workspace__slug"] == "sync"
    assert membership.call_args.kwargs["role__in"] == [20]


def operation(**extra):
    return {
        "project_id": str(uuid4()),
        "issue_ids": [str(uuid4())],
        "operation": "update",
        "action": "preview",
        "changes": {"priority": "high"},
        **extra,
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"priority": "highest"},
        {"state_id": "not-a-uuid"},
        {"type_id": ""},
        {"assignee_ids": ["invalid"]},
        {"label_ids": ["invalid"]},
        {"module_ids": ["invalid"]},
        {"start_date": "2026-02-30"},
        {"target_date": "not-a-date"},
        {"cycle_id": "invalid"},
        {"parent_id": "invalid"},
    ],
)
def test_invalid_fields_are_rejected(changes):
    serializer = OperationSerializer(data=operation(changes=changes))
    assert not serializer.is_valid()


def test_selection_limit_and_duplicates():
    uid = str(uuid4())
    for ids in ([], [uid, uid], [str(uuid4()) for _ in range(101)]):
        serializer = OperationSerializer(data=operation(issue_ids=ids))
        assert not serializer.is_valid()


def test_multiple_fields_and_explicit_unassignment():
    data = operation(
        changes={
            "state_id": str(uuid4()),
            "priority": "none",
            "label_ids": [str(uuid4())],
            "assignee_ids": [],
            "start_date": None,
            "target_date": "2026-11-01",
            "cycle_id": None,
            "module_ids": [],
            "parent_id": None,
        }
    )
    serializer = OperationSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["changes"]["assignee_ids"] == []
    assert len(serializer.validated_data["changes"]) == 9
    assert serializer.validated_data["changes"]["target_date"] == date(2026, 11, 1)
    assert serializer.validated_data["changes"]["parent_id"] is None


def test_dates_allow_clear_and_same_day_but_reject_reverse_range():
    validate_dates(None, date(2026, 11, 1))
    validate_dates(date(2026, 11, 1), None)
    validate_dates(date(2026, 11, 1), date(2026, 11, 1))
    with pytest.raises(ValidationError):
        validate_dates(date(2026, 11, 2), date(2026, 11, 1))


def test_parent_rejects_self_selected_parent_descendant_and_existing_cycle():
    selected, child, grandchild, root = [uuid4() for _ in range(4)]
    links = {root: None, selected: root, child: selected, grandchild: child}
    for candidate in (selected, child, grandchild):
        with pytest.raises(ValidationError):
            parent_chain(candidate, {selected}, links)
    assert parent_chain(root, {selected}, links) == [(str(root), "None")]
    with pytest.raises(ValidationError):
        parent_chain(uuid4(), {selected}, links)
    links[root] = child
    with pytest.raises(ValidationError):
        parent_chain(root, set(), links)


def test_nested_editor_asset_urls_are_updated_without_changing_other_projects():
    old, new, other = uuid4(), uuid4(), uuid4()
    value = {
        "content": [
            {"attrs": {"src": f"/api/assets/v2/workspaces/sync/projects/{old}/asset/"}},
            {"text": f"/projects/{other}/asset/"},
        ],
        "version": 1,
    }
    result = replace_project_urls(value, old, new)
    assert str(new) in result["content"][0]["attrs"]["src"]
    assert result["content"][1] == value["content"][1]
    assert str(old) in value["content"][0]["attrs"]["src"]
