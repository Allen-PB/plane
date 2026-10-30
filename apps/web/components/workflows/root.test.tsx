/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { WorkflowRoot } from "./root";

const service = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/services/workflow.service", () => ({ workflowService: service }));
vi.mock("@makeplane/propel/components/button", () => ({
  Button: ({
    label,
    size: _size,
    stretch: _stretch,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    size?: string;
    stretch?: string;
    variant?: string;
  }) => <button {...props}>{label}</button>,
}));
vi.mock("@makeplane/propel/components/input", () => ({
  Input: ({ size: _size, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size: string }) => (
    <input {...props} />
  ),
}));
vi.mock("./fields", () => ({
  workflowError: () => "Request failed",
  WorkflowInput: ({
    size: _size,
    ...props
  }: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size: string }) => <input {...props} />,
  WorkflowSelect: ({
    label,
    value,
    options,
    onChange,
    disabled,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));
const workflow = {
  id: "w1",
  name: "Engineering",
  description: "Team process",
  updated_at: "now",
  config: {
    states: [{ name: "Ready", description: "", group: "unstarted", color: "#60646C", default: true }],
    labels: [],
    estimates: { name: "Points", type: "points", values: ["1", "3"] },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  service.list.mockResolvedValue([structuredClone(workflow)]);
});
afterEach(cleanup);

async function selectWorkflow() {
  await screen.findByLabelText("Setup method");
  fireEvent.change(screen.getByLabelText("Setup method"), { target: { value: "saved" } });
  fireEvent.change(screen.getByLabelText("Saved workflow"), { target: { value: "w1" } });
}

describe("project workflows", () => {
  it("starts with manual setup and requires a preview", async () => {
    render(<WorkflowRoot workspaceSlug="team" projectId="project" />);
    expect(((await screen.findByLabelText("Setup method")) as HTMLSelectElement).value).toBe("manual");
    expect(screen.queryByText("Confirm and apply workflow")).toBeNull();
    await selectWorkflow();
    expect(screen.getByText("Preview changes")).toBeTruthy();
    expect(service.apply).not.toHaveBeenCalled();
  });
  it("blocks confirmation until every assigned estimate has a mapping", async () => {
    service.preview.mockResolvedValue({
      token: "t",
      changes: [],
      conflicts: [],
      estimate_mapping: [{ id: "p1", value: "Small", suggested: "" }],
    });
    render(<WorkflowRoot workspaceSlug="team" projectId="project" />);
    await selectWorkflow();
    fireEvent.click(screen.getByText("Preview changes"));
    expect(((await screen.findByText("Confirm and apply workflow")) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Replace estimate: Small"), { target: { value: "3" } });
    expect((screen.getByText("Confirm and apply workflow") as HTMLButtonElement).disabled).toBe(false);
    expect(service.apply).not.toHaveBeenCalled();
  });
  it("blocks applying conflicts", async () => {
    service.preview.mockResolvedValue({
      token: "t",
      changes: [],
      conflicts: ["Estimate name conflict"],
      estimate_mapping: [],
    });
    render(<WorkflowRoot workspaceSlug="team" projectId="project" />);
    await selectWorkflow();
    fireEvent.click(screen.getByText("Preview changes"));
    expect(await screen.findByText("Estimate name conflict")).toBeTruthy();
    expect((screen.getByText("Confirm and apply workflow") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("workspace workflows", () => {
  it("requires deletion confirmation", async () => {
    service.remove.mockResolvedValue(undefined);
    render(<WorkflowRoot workspaceSlug="team" />);
    fireEvent.click(await screen.findByText("Delete"));
    expect(service.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm deletion"));
    await waitFor(() => expect(service.remove).toHaveBeenCalledWith("team", "w1"));
    expect(await screen.findByText("Workflow deleted.")).toBeTruthy();
  });
  it("duplicates into an independent editable draft", async () => {
    render(<WorkflowRoot workspaceSlug="team" />);
    fireEvent.click(await screen.findByText("Duplicate"));
    expect((screen.getByLabelText("Workflow name") as HTMLInputElement).value).toBe("Engineering (copy)");
    expect(service.save).not.toHaveBeenCalled();
  });
  it("shows load failures with a retry", async () => {
    service.list.mockRejectedValueOnce(new Error("offline"));
    render(<WorkflowRoot workspaceSlug="team" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Request failed");
    fireEvent.click(screen.getByText("Reload workflows"));
    expect(await screen.findByText("Engineering")).toBeTruthy();
  });
});
