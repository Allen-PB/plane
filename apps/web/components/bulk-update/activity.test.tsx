import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BulkWorkItemActivity } from "./activity";

const state = vi.hoisted(() => ({
  activity: undefined as undefined | { field: string; comment: string; old_value?: string; new_value?: string },
}));
vi.mock("@/hooks/store/use-issue-detail", () => ({
  useIssueDetail: () => ({ activity: { getActivityById: () => state.activity } }),
}));
vi.mock("@/components/issues/issue-detail/issue-activity/activity/actions/helpers/activity-block", () => ({
  IssueActivityBlockComponent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
afterEach(cleanup);
describe("Bulk work item history", () => {
  it("shows the field summary for a bulk update", () => {
    state.activity = { field: "bulk_update", comment: "Bulk Update: Priority: High; Replace labels: Request" };
    render(<BulkWorkItemActivity activityId="event" ends={undefined} />);
    expect(screen.getByText(/updated this work item in bulk/).textContent).toContain(
      "Priority: High; Replace labels: Request"
    );
  });
  it("shows old and new keys for a bulk move", () => {
    state.activity = {
      field: "project",
      comment: "Bulk Update: moved to Destination",
      old_value: "SRC-1",
      new_value: "DST-2",
    };
    render(<BulkWorkItemActivity activityId="event" ends={undefined} />);
    expect(screen.getByText("moved the work item from SRC-1 to DST-2.")).toBeTruthy();
  });
  it("preserves existing behavior for unrelated project events", () => {
    state.activity = { field: "project", comment: "Unrelated event" };
    const { container } = render(<BulkWorkItemActivity activityId="event" ends={undefined} />);
    expect(container.textContent).toBe("");
  });
});
