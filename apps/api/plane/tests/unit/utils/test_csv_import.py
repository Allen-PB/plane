# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace

import pytest

from plane.utils.csv_import import map_row, name_index, parse_csv, validate_mapping

pytestmark = pytest.mark.unit


def test_bom_quoted_commas_newlines_and_empty_cells():
    headers, rows, mapping = parse_csv('\ufeffTitle,Description,Tags\r\n"A, B","first\nsecond",\r\n'.encode())
    assert headers == ["Title", "Description", "Tags"]
    assert rows == [{"line": 2, "values": ["A, B", "first\nsecond", ""], "error": ""}]
    assert mapping == ["name", "description", "labels"]


def test_malformed_rows_and_unterminated_quotes_have_source_lines():
    _, rows, _ = parse_csv(b'Title,Tags\nvalid,bug\nextra,a,b\n"unterminated')
    assert rows[1]["line"] == 3
    assert "Expected 2 cells" in rows[1]["error"]
    assert rows[2]["line"] == 4
    assert "Malformed CSV" in rows[2]["error"]
    assert "unterminated" in rows[2]["values"][0]


@pytest.mark.parametrize("content", [b"", b"title\n", b"Title\n\xff", b"Title\n\x00"])
def test_invalid_files_rejected(content):
    with pytest.raises(ValueError):
        parse_csv(content)


def test_duplicate_and_arbitrary_headers_use_column_indices():
    headers, rows, suggested = parse_csv(b"Whatever,Issue Type,Title,Title\nTask,Bug,Name,Other")
    assert suggested == ["", "", "name", ""]
    mapping = ["", "labels", "name", ""]
    validate_mapping(mapping, len(headers), ";")
    data, names, errors = map_row(rows[0], mapping, ";", {"bug": "id"}, {})
    assert data["name"] == "Name"
    assert names == ["Bug"]
    assert not errors


@pytest.mark.parametrize(
    "mapping,separator", [(["labels"], ";"), (["other"], ";"), (["name", "name"], ";"), (["name"], "")]
)
def test_invalid_mappings_rejected(mapping, separator):
    with pytest.raises(ValueError):
        validate_mapping(mapping, len(mapping), separator)


def test_labels_case_insensitive_multiple_separator_and_explicit_creation():
    row = {"line": 2, "values": ["Task", "Bug | Feature | Bug"], "error": ""}
    _, names, errors = map_row(row, ["name", "labels"], "|", {"bug": "id"}, {})
    assert names == ["Bug", "Feature"]
    assert errors == ["Unknown label: Feature. Enable creation of missing labels or correct the value."]
    assert not map_row(row, ["name", "labels"], "|", {"bug": "id"}, {}, True)[2]


def test_invalid_values_and_html_escaping():
    row = {"line": 2, "values": ["", "<script>bad</script>", "major", "missing", "2026-02-30"], "error": ""}
    data, _, errors = map_row(row, ["name", "description", "priority", "state", "target_date"], ";", {}, {})
    assert len(errors) == 4
    assert data["description_html"] == "<p>&lt;script&gt;bad&lt;/script&gt;</p>"


def test_date_order_and_ambiguous_names():
    index = name_index([SimpleNamespace(name="Bug", id="1"), SimpleNamespace(name="bug", id="2")])
    row = {"line": 2, "values": ["Task", "2026-02-02", "2026-02-01", "BUG"], "error": ""}
    _, _, errors = map_row(row, ["name", "start_date", "target_date", "labels"], ";", index, {}, True)
    assert len(errors) == 2
    assert "Ambiguous" in errors[1]


def test_size_row_and_column_limits():
    for content in (b"x" * (5 * 1024 * 1024 + 1), b"Name\n" + b"Task\n" * 10001, b"," * 100 + b"\nTask"):
        with pytest.raises(ValueError):
            parse_csv(content)


def test_parser_recovers_after_malformed_quoted_row():
    _, rows, _ = parse_csv(b'Title,Labels\n"bad"oops,bug\nGood,Feature')
    assert "Malformed CSV" in rows[0]["error"]
    assert rows[1]["values"] == ["Good", "Feature"]


def test_original_desktop_csv_compatibility():
    headers, rows, mapping = parse_csv(
        b"Name,Description,State Name,Priority,Assignees,Due Date,Labels\n"
        b'Task,"First\\n<b>Second</b>", ready ,HIGH,,,bug|Feature'
    )
    validate_mapping(mapping, len(headers), "|")
    states = name_index([SimpleNamespace(name=" Ready ", id="state")])
    labels = name_index([SimpleNamespace(name=" Bug ", id="bug"), SimpleNamespace(name="Feature", id="feature")])
    data, names, errors = map_row(rows[0], mapping, "|", labels, states)
    assert not errors
    assert mapping == ["name", "description", "state", "priority", "", "target_date", "labels"]
    assert data["description_html"] == "<p>First<br>&lt;b&gt;Second&lt;/b&gt;</p>"
    assert data["state_id"] == "state"
    assert data["priority"] == "high"
    assert names == ["bug", "Feature"]
