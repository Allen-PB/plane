import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { SWRConfig } from "swr";
import { BulkUpdateRoot } from "./root";

const service = vi.hoisted(() => ({ projects: vi.fn(), items: vi.fn(), preview: vi.fn(), apply: vi.fn() }));
vi.mock("@makeplane/propel/components/checkbox", () => ({
  Checkbox: ({
    onCheckedChange,
    label,
    indeterminate: _indeterminate,
    stretch: _stretch,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    onCheckedChange: (checked: boolean) => void;
    indeterminate?: boolean;
    stretch?: string;
    label?: string;
  }) =>
    label ? (
      <label>
        <input {...props} type="checkbox" onChange={(e) => onCheckedChange(e.target.checked)} />
        {label}
      </label>
    ) : (
      <input {...props} type="checkbox" onChange={(e) => onCheckedChange(e.target.checked)} />
    ),
}));
vi.mock("@/services/bulk-update.service", () => ({ bulkUpdateService: service }));
vi.mock("@makeplane/propel/components/button", () => ({
  Button: ({
    label,
    stretch: _stretch,
    size: _size,
    variant: _variant,
    icon: _icon,
    iconPosition: _iconPosition,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    stretch?: string;
    size?: string;
    variant?: string;
    icon?: ReactNode;
    iconPosition?: string;
  }) => <button {...props}>{label}</button>,
}));
vi.mock("@makeplane/propel/components/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@makeplane/propel/components/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/workflows/fields", () => ({
  workflowError: () => "Request failed. Review again.",
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
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));
const item = {
  id: "i1",
  key: "SRC-1",
  name: "First work item",
  state: "Ready",
  priority: "none",
  assignees: [],
  labels: [],
  start_date: null,
  target_date: null,
  parent: "",
};
const noFilters = {
  state_ids: [],
  priorities: [],
  assignee_ids: [],
  label_ids: [],
  parent_ids: [],
  start_date_from: "",
  start_date_to: "",
  due_date_from: "",
  due_date_to: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  service.projects.mockResolvedValue([
    { id: "p1", name: "Source", identifier: "SRC" },
    { id: "p2", name: "Other", identifier: "OTH" },
  ]);
  service.items.mockResolvedValue({
    results: [item],
    count: 1,
    metadata: {
      states: [{ id: "s1", name: "Ready" }],
      members: [],
      labels: [{ id: "l1", name: "Request" }],
      cycles: [{ id: "c1", name: "Sprint 1" }],
      modules: [{ id: "m1", name: "Student App" }],
      parents: [{ id: "p9", name: "SRC-9 · Parent work item" }],
    },
  });
  service.preview.mockResolvedValue({ count: 1, token: "review-token", summary: ["Review changes"], items: [item] });
  service.apply.mockResolvedValue({ count: 1 });
});
afterEach(cleanup);
function TestCache({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}
const start = async () => {
  render(<BulkUpdateRoot workspaceSlug="sync" />, { wrapper: TestCache });
  await waitFor(() => expect(screen.getByLabelText("Project")).not.toHaveProperty("disabled", true));
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).not.toHaveProperty("disabled", true));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByLabelText("Select SRC-1"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};
const details = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));

describe("Bulk Update wizard", () => {
  it("starts without a project and never loads the route project automatically", async () => {
    render(<BulkUpdateRoot workspaceSlug="sync" />, { wrapper: TestCache });
    await waitFor(() => expect(screen.getByLabelText("Project")).not.toHaveProperty("disabled", true));
    expect(screen.getByLabelText("Project")).toHaveProperty("value", "");
    expect(service.items).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
  });
  it("requires selection, supports labels and priority, and applies only after review", async () => {
    await start();
    details();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Change Priority"));
    fireEvent.click(screen.getByLabelText("Change Labels"));
    fireEvent.click(screen.getByLabelText("Request"));
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.apply).not.toHaveBeenCalled();
    expect(service.preview).toHaveBeenCalledWith(
      "sync",
      expect.objectContaining({ project_id: "p1", issue_ids: ["i1"], changes: { priority: "high", label_ids: ["l1"] } })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and Apply" }));
    await screen.findByText("Bulk operation complete");
    expect(service.apply).toHaveBeenCalledWith("sync", expect.anything(), "review-token");
  });
  it("replaces Delete with Archive and uses the existing confirmation", async () => {
    await start();
    expect(screen.queryByRole("radio", { name: /Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Archive/ }));
    details();
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.apply).not.toHaveBeenCalled();
    expect(service.preview).toHaveBeenCalledWith("sync", expect.objectContaining({ operation: "archive" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and Apply" }));
    await screen.findByText("1 work items archived.");
    expect(service.apply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("identifies failures and skips without counting them as archived", async () => {
    service.apply.mockResolvedValue({
      count: 0,
      results: [
        { id: "i1", key: "SRC-1", name: "First work item", status: "failed", reason: "Unable to archive." },
        { id: "i2", key: "SRC-2", name: "Changed", status: "skipped", reason: "Review again." },
      ],
    });
    await start();
    fireEvent.click(screen.getByRole("radio", { name: /Archive/ }));
    details();
    details();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and Apply" }));
    await screen.findByText("0 work items archived.");
    expect(screen.getByText(/SRC-1.*failed.*Unable to archive/)).toBeTruthy();
    expect(screen.getByText(/SRC-2.*skipped.*Review again/)).toBeTruthy();
  });
  it("supports dates, cycle, multiple modules and a searched parent in one review", async () => {
    await start();
    details();
    service.items.mockResolvedValue({
      results: [item, { ...item, id: "parent", key: "SRC-2", name: "Parent work item" }],
      count: 2,
    });
    for (const label of ["Start Date", "Due Date", "Cycle", "Modules", "Parent"])
      fireEvent.click(screen.getByLabelText(`Change ${label}`));
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-10-27" } });
    fireEvent.change(screen.getByLabelText("Due Date"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Cycle"), { target: { value: "c1" } });
    fireEvent.click(screen.getByLabelText("Student App"));
    await waitFor(() => expect(screen.getByLabelText("Parent")).not.toHaveProperty("disabled", true));
    expect(screen.queryByRole("option", { name: "SRC-1 · First work item" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Parent"), { target: { value: "parent" } });
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.preview).toHaveBeenCalledWith(
      "sync",
      expect.objectContaining({
        changes: {
          start_date: "2026-10-27",
          target_date: "2026-10-30",
          cycle_id: "c1",
          module_ids: ["m1"],
          parent_id: "parent",
        },
      })
    );
  });
  it("blocks reversed dates and lets unchecked fields remain unchanged", async () => {
    await start();
    details();
    fireEvent.click(screen.getByLabelText("Change Start Date"));
    fireEvent.click(screen.getByLabelText("Change Due Date"));
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("Due Date"), { target: { value: "2026-11-01" } });
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("alert").textContent).toContain("Start Date must be on or before Due Date");
    fireEvent.click(screen.getByLabelText("Change Due Date"));
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.preview).toHaveBeenCalledWith(
      "sync",
      expect.objectContaining({ changes: { start_date: "2026-11-02" } })
    );
  });
  it("makes clearing labels, dates, cycle, modules and parent explicit", async () => {
    await start();
    details();
    for (const label of ["Labels", "Start Date", "Due Date", "Cycle", "Modules", "Parent"])
      fireEvent.click(screen.getByLabelText(`Change ${label}`));
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.preview).toHaveBeenCalledWith(
      "sync",
      expect.objectContaining({
        changes: {
          label_ids: [],
          start_date: null,
          target_date: null,
          cycle_id: null,
          module_ids: [],
          parent_id: null,
        },
      })
    );
  });
  it("requires a destination per work item", async () => {
    await start();
    fireEvent.click(screen.getByRole("radio", { name: /Move/ }));
    details();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Destination for SRC-1"), { target: { value: "p2" } });
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.preview).toHaveBeenCalledWith("sync", expect.objectContaining({ destinations: { i1: "p2" } }));
  });
  it("invalidates review after a failed apply and requires a fresh preview", async () => {
    service.apply.mockRejectedValue(new Error("stale"));
    await start();
    details();
    fireEvent.click(screen.getByLabelText("Change Priority"));
    details();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and Apply" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Confirm and Apply" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    details();
    await waitFor(() => expect(service.preview).toHaveBeenCalledTimes(2));
  });
  it("searches, selects a whole page and keeps selections across pages", async () => {
    const row = (n: number) => ({ ...item, id: `i${n}`, key: `SRC-${n}`, name: `Work item ${n}` });
    service.items.mockImplementation(async (_slug: string, _project: string, page: number, search: string) => ({
      results: search ? [row(3)] : page === 1 ? [row(1), row(2)] : [row(3)],
      count: search ? 1 : 30,
      metadata: { states: [], members: [], labels: [], cycles: [], modules: [] },
    }));
    render(<BulkUpdateRoot workspaceSlug="sync" />, { wrapper: TestCache });
    await waitFor(() => expect(screen.getByLabelText("Project")).not.toHaveProperty("disabled", true));
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).not.toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByLabelText("Select SRC-2");
    fireEvent.click(screen.getByLabelText("Select all work items on this page"));
    expect(screen.getByText(/2 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(await screen.findByLabelText("Select SRC-3"));
    expect(screen.getByText(/3 selected/)).toBeTruthy();
    expect(service.items).toHaveBeenCalledWith("sync", "p1", 2, "", noFilters);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByLabelText("Select SRC-1")).toHaveProperty("checked", true);
    fireEvent.change(screen.getByLabelText("Search work items"), { target: { value: "SRC-3" } });
    await waitFor(() => expect(service.items).toHaveBeenCalledWith("sync", "p1", 1, "SRC-3", noFilters));
    expect(await screen.findByLabelText("Select SRC-3")).toHaveProperty("checked", true);
    expect(screen.queryByLabelText("Select SRC-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    details();
    fireEvent.click(screen.getByLabelText("Change Priority"));
    details();
    await screen.findByRole("button", { name: "Confirm and Apply" });
    expect(service.preview).toHaveBeenCalledWith("sync", expect.objectContaining({ issue_ids: ["i1", "i2", "i3"] }));
  });
  it("combines Jira-style filters, skips reversed dates, clears them and keeps selections", async () => {
    render(<BulkUpdateRoot workspaceSlug="sync" />, { wrapper: TestCache });
    await waitFor(() => expect(screen.getByLabelText("Project")).not.toHaveProperty("disabled", true));
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).not.toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByLabelText("Select SRC-1"));
    const pick = (filter: string, option: string) =>
      fireEvent.click(within(screen.getByRole("group", { name: `${filter} filter` })).getByLabelText(option));
    const lastFilters = () => service.items.mock.calls.at(-1)?.[4];
    pick("State", "Ready");
    pick("Priority", "High");
    pick("Priority", "Urgent");
    pick("Assignee", "Unassigned");
    const labels = within(screen.getByRole("group", { name: "Label filter" }));
    expect(labels.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["No labels", "Request"]);
    fireEvent.change(labels.getByLabelText("Search label options"), { target: { value: "req" } });
    expect(labels.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Request"]);
    pick("Label", "Request");
    expect(labels.getByRole("listitem").className).toContain("bg-layer-transparent-selected");
    pick("Parent", "SRC-9 · Parent work item");
    fireEvent.change(screen.getByLabelText("Start Date From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Due Date To"), { target: { value: "2026-11-30" } });
    const combined = {
      ...noFilters,
      state_ids: ["s1"],
      priorities: ["high", "urgent"],
      assignee_ids: ["none"],
      label_ids: ["l1"],
      parent_ids: ["p9"],
      start_date_from: "2026-11-01",
      due_date_to: "2026-11-30",
    };
    await waitFor(() => expect(lastFilters()).toEqual(combined));
    expect(service.items.mock.calls.at(-1)?.[2]).toBe(1);
    expect(screen.getByRole("button", { name: /Priority · 2/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Due Date From"), { target: { value: "2026-12-01" } });
    expect(screen.getByRole("alert").textContent).toContain("Due Date From must be on or before Due Date To");
    await waitFor(() => expect(lastFilters()).toEqual({ ...combined, due_date_to: "" }));
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastFilters()).toEqual(noFilters));
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(screen.getByLabelText("Select SRC-1")).toHaveProperty("checked", true);
  });
  it("clears prior selection when the project changes", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).not.toHaveProperty("disabled", true));
    details();
    expect(screen.getByLabelText("Select SRC-1")).not.toHaveProperty("checked", true);
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
  });
});

it("blocks Update and Move for triage while keeping Archive available", async () => {
  service.items.mockResolvedValue({
    results: [{ ...item, state: "Triage", state_group: "triage" }],
    count: 1,
    metadata: {},
  });
  await start();
  expect(screen.getByText(/Update and Move are unavailable while triage/)).toBeTruthy();
  for (const name of [/^Update/, /^Move/]) {
    const radio = screen.getByRole("radio", { name });
    expect(radio.hasAttribute("disabled") || radio.getAttribute("aria-disabled") === "true").toBe(true);
  }
  expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("radio", { name: /^Archive/ }));
  expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", false);
  details();
  details();
  await screen.findByRole("button", { name: "Confirm and Apply" });
  expect(service.preview).toHaveBeenCalledWith("sync", expect.objectContaining({ operation: "archive" }));
});

it("reenables Update and Move after triage is removed from the selection", async () => {
  service.items.mockResolvedValue({
    results: [
      { ...item, state_group: "triage" },
      { ...item, id: "i2", key: "SRC-2" },
    ],
    count: 2,
    metadata: {},
  });
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByLabelText("Select SRC-1"));
  fireEvent.click(screen.getByLabelText("Select SRC-2"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText(/Update and Move are unavailable while triage/)).toBeNull();
  for (const name of [/^Update/, /^Move/]) {
    const radio = screen.getByRole("radio", { name });
    expect(radio.hasAttribute("disabled") || radio.getAttribute("aria-disabled") === "true").toBe(false);
  }
  expect(screen.getByRole("button", { name: "Next" })).toHaveProperty("disabled", false);
});
