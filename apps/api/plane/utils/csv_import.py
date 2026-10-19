# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""CSV parsing and field mapping shared by preview, validation and the worker."""

import csv
import io
from datetime import date
from html import escape

FIELDS = {
    "name": "Name (required)",
    "description": "Description (plain text)",
    "priority": "Priority",
    "state": "State",
    "labels": "Labels",
    "start_date": "Start date (YYYY-MM-DD)",
    "target_date": "Due date (YYYY-MM-DD)",
}
ALIASES = {
    "title": "name",
    "summary": "name",
    "issue name": "name",
    "name": "name",
    "description": "description",
    "body": "description",
    "priority": "priority",
    "status": "state",
    "state": "state",
    "state name": "state",
    "label": "labels",
    "labels": "labels",
    "tags": "labels",
    "start date": "start_date",
    "due date": "target_date",
    "target date": "target_date",
}
MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10000


def parse_csv(content):
    if len(content) > MAX_BYTES:
        raise ValueError("CSV must be at most 5 MB.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Save the CSV using UTF-8 encoding.") from exc
    if "\x00" in text:
        raise ValueError("CSV contains NUL characters; save it as UTF-8 text.")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = next(reader)
    except (StopIteration, csv.Error) as exc:
        raise ValueError("CSV must contain a valid header row.") from exc
    if not headers or len(headers) > 100:
        raise ValueError("CSV must have between 1 and 100 columns.")
    rows = []
    while True:
        line = reader.line_num + 1
        try:
            values = next(reader)
        except StopIteration:
            break
        except csv.Error as exc:
            raw = "".join(text.splitlines(keepends=True)[line - 1 : reader.line_num])
            rows.append({"line": line, "values": [raw], "error": f"Malformed CSV: {exc}"})
            if len(rows) > MAX_ROWS:
                raise ValueError("Split the CSV into files of at most 10,000 rows.") from exc
            continue
        if not values or not any(value.strip() for value in values):
            continue
        error = "" if len(values) == len(headers) else f"Expected {len(headers)} cells, found {len(values)}."
        rows.append({"line": line, "values": values, "error": error})
        if len(rows) > MAX_ROWS:
            raise ValueError("Split the CSV into files of at most 10,000 rows.")
    if not rows:
        raise ValueError("CSV has no data rows.")
    # Indices, rather than header names, support duplicate and arbitrary headers.
    mapping = []
    for header in headers:
        field = ALIASES.get(header.strip().lower().replace("_", " "), "")
        mapping.append(field if field not in mapping else "")
    return headers, rows, mapping


def validate_mapping(mapping, column_count, separator):
    if not isinstance(mapping, list) or len(mapping) != column_count:
        raise ValueError("Choose a field or Skip for each CSV column.")
    if any(not isinstance(field, str) or (field and field not in FIELDS) for field in mapping):
        raise ValueError("Mapping contains an unsupported field.")
    selected = [field for field in mapping if field]
    if len(selected) != len(set(selected)):
        raise ValueError("Map each Plane field only once.")
    if "name" not in selected:
        raise ValueError("Map a CSV column to Name.")
    if not isinstance(separator, str) or not 1 <= len(separator) <= 10 or "\n" in separator or "\r" in separator:
        raise ValueError("Label separator must contain 1–10 characters, without newlines.")


def map_row(row, mapping, separator, labels, states, create_labels=False):
    """Return serializer data, requested label names, and actionable errors."""
    if row["error"]:
        return {}, [], [row["error"]]
    values = {field: row["values"][i].strip() for i, field in enumerate(mapping) if field}
    data = {"name": values.get("name", "")}
    errors = []
    if not data["name"] or len(data["name"]) > 255:
        errors.append("Name is required and must contain at most 255 characters.")
    if values.get("description"):
        # Preserve the desktop importer's Jira CSV description conversion.
        description = values["description"].replace("\\n", "\n")
        data["description_html"] = "<p>" + escape(description).replace("\n", "<br>") + "</p>"
    if values.get("priority"):
        priority = values["priority"].lower()
        if priority not in {"none", "urgent", "high", "medium", "low"}:
            errors.append("Priority must be none, urgent, high, medium, or low.")
        else:
            data["priority"] = priority
    if values.get("state"):
        state = states.get(values["state"].casefold())
        if state is None:
            errors.append(f"Unknown or ambiguous project state: {values['state']}.")
        else:
            data["state_id"] = str(state)
    for field in ("start_date", "target_date"):
        if values.get(field):
            try:
                parsed = date.fromisoformat(values[field])
                if parsed.isoformat() != values[field]:
                    raise ValueError
                data[field] = parsed.isoformat()
            except ValueError:
                errors.append(f"{FIELDS[field]} must use YYYY-MM-DD.")
    if data.get("start_date") and data.get("target_date") and data["start_date"] > data["target_date"]:
        errors.append("Start date cannot be after due date.")
    names = list(dict.fromkeys(name.strip() for name in values.get("labels", "").split(separator) if name.strip()))
    for name in names:
        if len(name) > 255:
            errors.append(f"Label exceeds 255 characters: {name[:40]}…")
        elif name.casefold() in labels and labels[name.casefold()] is None:
            errors.append(f"Ambiguous project label: {name}. Rename duplicate labels first.")
        elif name.casefold() not in labels and not create_labels:
            errors.append(f"Unknown label: {name}. Enable creation of missing labels or correct the value.")
    return data, names, errors


def name_index(objects):
    result = {}
    for obj in objects:
        # Adapted from named() in the original desktop import_plane.py.
        key = obj.name.strip().casefold()
        result[key] = None if key in result else obj.id
    return result
