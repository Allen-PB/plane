import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import WorkspaceSettingLayout from "../../app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout";

const state = vi.hoisted(() => ({ role: 20, path: "/sync/settings/bulk-update/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("react-router", () => ({ Outlet: () => <div>Settings page content</div> }));
vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({
    workspaceUserInfo: { sync: { role: state.role } },
    getWorkspaceRoleByWorkspaceSlug: () => state.role,
  }),
}));
vi.mock("@/components/auth-screens/not-authorized-view", () => ({ NotAuthorizedView: () => <div>Access denied</div> }));
vi.mock("@/components/settings/mobile/nav", () => ({ SettingsMobileNav: () => null }));
vi.mock("@/components/settings/workspace/sidebar", () => ({
  WorkspaceSettingsSidebarRoot: () => <div>Workspace navigation</div>,
}));
afterEach(cleanup);
function open(path: string, role: number) {
  state.path = path;
  state.role = role;
  render(
    <WorkspaceSettingLayout
      {...({ params: { workspaceSlug: "sync" } } as ComponentProps<typeof WorkspaceSettingLayout>)}
    />
  );
}
describe("Workspace Settings route guard", () => {
  it("allows Workspace Admins through the parent layout to Bulk Update", () => {
    open("/sync/settings/bulk-update/", 20);
    expect(screen.queryByText("Access denied")).toBeNull();
    expect(screen.getByText("Settings page content")).toBeTruthy();
  });
  it.each([15, 5])("denies role %s access to Bulk Update", (role) => {
    open("/sync/settings/bulk-update/", role);
    expect(screen.getByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("Settings page content")).toBeNull();
  });
  it("retains Admin access to CSV Import", () => {
    open("/sync/settings/csv-import/", 20);
    expect(screen.getByText("Settings page content")).toBeTruthy();
  });
  it("retains the existing Member access to General settings", () => {
    open("/sync/settings/", 15);
    expect(screen.getByText("Settings page content")).toBeTruthy();
  });
  it("continues to deny unregistered settings routes even for Admins", () => {
    open("/sync/settings/unregistered/", 20);
    expect(screen.getByText("Access denied")).toBeTruthy();
  });
});
