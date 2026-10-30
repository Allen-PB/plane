/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkItemFieldGuidance } from "./field-guidance";
import type { WorkItemGuidanceField } from "./field-guidance";

function Form({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [open, setOpen] = useState<WorkItemGuidanceField | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {(["title", "description"] as const).map((field) => (
        <WorkItemFieldGuidance
          key={field}
          field={field}
          open={open === field}
          onOpenChange={(next) => setOpen((current) => (next ? field : current === field ? null : current))}
        />
      ))}
      <input id="name" defaultValue="User title" />
      <textarea aria-label="Description" defaultValue="User description" />
      <button type="button">Outside</button>
    </form>
  );
}

describe("work item field guidance", () => {
  it("toggles title guidance without submitting or changing form values", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Form onSubmit={submit} />);
    const trigger = screen.getByRole("button", { name: "Title guidance" });
    await user.click(trigger);
    expect(await screen.findByText("Naming convention")).toBeDefined();
    expect(screen.getByText("Summary - Module - User role - Device - OS - Type")).toBeDefined();
    expect(screen.getByText("Type: Issue or Request")).toBeDefined();
    expect(screen.getByText("Unable to log in - Accounts - Admin - Desktop - Windows - Issue")).toBeDefined();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("User title");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("User description");
    expect(submit).not.toHaveBeenCalled();
    await user.click(trigger);
    await waitFor(() => expect(screen.queryByText("Naming convention")).toBeNull());
  });

  it("replaces title guidance with two ordered description lists and dismisses outside", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("button", { name: "Title guidance" }));
    await user.click(screen.getByRole("button", { name: "Description guidance" }));
    await waitFor(() => expect(screen.queryByText("Naming convention")).toBeNull());
    const lists = screen.getAllByRole("list");
    expect(
      lists.map((list) =>
        within(list)
          .getAllByRole("listitem")
          .map((item) => item.textContent)
      )
    ).toEqual([
      ["Issue Description", "Steps to Reproduce", "Actual Result", "Expected Result"],
      ["Request Description", "Reason", "Expected Outcome"],
    ]);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(screen.queryByText("For an Issue")).toBeNull());
  });

  it("opens by keyboard and closes on Escape with focus returned to the trigger", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const trigger = screen.getByRole("button", { name: "Title guidance" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Naming convention")).toBeDefined();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Naming convention")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.keyboard(" ");
    expect(await screen.findByText("Naming convention")).toBeDefined();
  });

  it("supports touch activation", async () => {
    const user = userEvent.setup();
    render(<Form />);
    const trigger = screen.getByRole("button", { name: "Description guidance" });
    await user.pointer([
      { keys: "[TouchA>]", target: trigger },
      { keys: "[/TouchA]", target: trigger },
    ]);
    expect(await screen.findByText("For a Request")).toBeDefined();
  });
});
