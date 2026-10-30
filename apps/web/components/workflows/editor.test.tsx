/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowEditor, initialWorkflow } from "./editor";

afterEach(cleanup);
function mount(initial = initialWorkflow(), busy = false) {
  const onSave = vi.fn();
  render(<WorkflowEditor initial={initial} busy={busy} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

describe("workflow editor fields", () => {
  it("frames empty and populated text controls and provides a multiline description", () => {
    mount();
    const name = screen.getByLabelText("Workflow name");
    const state = screen.getByRole("textbox", { name: "State name 1" });
    expect(name.parentElement?.className).toContain("border-sm");
    expect(state.parentElement?.className).toContain("border-sm");
    expect(name.getAttribute("placeholder")).toBe("e.g. Engineering workflow");
    expect(screen.getByLabelText("Description").tagName).toBe("TEXTAREA");
    fireEvent.invalid(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(name, { target: { value: "Engineering" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });
  it("defaults new estimate configurations to Fibonacci with unchanged values", () => {
    const save = mount();
    fireEvent.change(screen.getByLabelText("Workflow name"), { target: { value: "New workflow" } });
    fireEvent.click(screen.getByLabelText("Include estimate system"));
    expect((screen.getByLabelText("Estimate system name") as HTMLInputElement).value).toBe("Fibonacci");
    fireEvent.submit(screen.getByLabelText("Workflow name").closest("form")!);
    expect(save.mock.calls[0][0].config.estimates).toEqual({
      name: "Fibonacci",
      type: "points",
      values: ["1", "2", "3", "5", "8"],
    });
  });
  it("preserves saved names and custom names when toggling estimates", () => {
    const draft = initialWorkflow();
    draft.name = "Existing";
    draft.config.estimates = { name: "Story points", type: "points", values: ["2", "4"] };
    mount(draft);
    const field = screen.getByLabelText("Estimate system name") as HTMLInputElement;
    expect(field.value).toBe("Story points");
    fireEvent.change(field, { target: { value: "Team effort" } });
    fireEvent.click(screen.getByLabelText("Include estimate system"));
    fireEvent.click(screen.getByLabelText("Include estimate system"));
    expect((screen.getByLabelText("Estimate system name") as HTMLInputElement).value).toBe("Team effort");
    expect((screen.getByLabelText("Values, in order (comma separated, maximum 13)") as HTMLInputElement).value).toBe(
      "2, 4"
    );
  });
  it("disables editing while saving", () => {
    mount(initialWorkflow(), true);
    expect(screen.getByLabelText("Workflow name").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Description").matches(":disabled")).toBe(true);
  });
});
