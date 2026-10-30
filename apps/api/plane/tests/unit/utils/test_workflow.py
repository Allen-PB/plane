# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from copy import deepcopy
import pytest
from plane.app.serializers.workflow import WorkflowConfigSerializer

pytestmark = pytest.mark.unit


def config():
    return {
        "states": [{"name": "Todo", "color": "#60646C", "group": "unstarted", "default": True}],
        "labels": [],
        "estimates": None,
    }


def test_valid_configuration():
    serializer = WorkflowConfigSerializer(data=config())
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["states"][0]["description"] == ""


@pytest.mark.parametrize("defaults", [[False], [True, True]])
def test_requires_exactly_one_default(defaults):
    data = config()
    data["states"] = [{**data["states"][0], "name": str(i), "default": v} for i, v in enumerate(defaults)]
    assert not WorkflowConfigSerializer(data=data).is_valid()


@pytest.mark.parametrize("section", ["states", "labels"])
def test_duplicate_names_ignore_case_and_whitespace(section):
    data = config()
    item = data["states"][0] if section == "states" else {"name": "Bug", "color": "#60646C"}
    data[section] = [deepcopy(item), {**item, "name": " " + item["name"].upper() + " "}]
    assert not WorkflowConfigSerializer(data=data).is_valid()


@pytest.mark.parametrize("field,value", [("color", "red"), ("group", "triage"), ("name", " ")])
def test_invalid_state_configuration(field, value):
    data = config()
    data["states"][0][field] = value
    assert not WorkflowConfigSerializer(data=data).is_valid()


@pytest.mark.parametrize("values", [[], ["1", "1"], [""], list(map(str, range(14)))])
def test_invalid_estimate_values(values):
    data = config()
    data["estimates"] = {"name": "Points", "type": "points", "values": values}
    assert not WorkflowConfigSerializer(data=data).is_valid()


def test_empty_states_rejected():
    data = config()
    data["states"] = []
    assert not WorkflowConfigSerializer(data=data).is_valid()


def test_partial_config_cannot_omit_sections():
    serializer = WorkflowConfigSerializer(data={"states": config()["states"]}, partial=True)
    assert not serializer.is_valid()
    assert "labels" in serializer.errors
    assert "estimates" in serializer.errors
