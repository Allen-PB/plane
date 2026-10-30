import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsSidebarItemCategories } from "./item-categories";

const state = vi.hoisted(() => ({ admin: true }));
vi.mock("react-router", () => ({ useParams: () => ({ workspaceSlug: "sync" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/sync/settings/bulk-update/" }));
vi.mock("@plane/i18n", () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock("@plane/utils", () => ({
  joinUrlPath: (...parts: string[]) => "/" + parts.map((part) => part.replace(/^\/+|\/+$/g, "")).join("/"),
}));
vi.mock("@plane/constants", () => ({
  EUserPermissions: { ADMIN: 20 },
  EUserPermissionsLevel: { WORKSPACE: "workspace" },
  WORKSPACE_SETTINGS_CATEGORIES: ["administration"],
  WORKSPACE_SETTINGS_CATEGORY_LABELS: { administration: "Administration" },
  GROUPED_WORKSPACE_SETTINGS: {
    administration: [{ key: "export", href: "/settings/exports", access: [20, 15], i18n_label: "Exports" }],
  },
}));
vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({ allowPermissions: (roles: number[]) => roles.includes(state.admin ? 20 : 15) }),
}));
vi.mock("./item-icon", () => ({ WORKSPACE_SETTINGS_ICONS: { export: () => null } }));
vi.mock("@/components/settings/sidebar/item", () => ({
  SettingsSidebarItem: ({ href, label, isActive }: { href: string; label: string; isActive: boolean }) => (
    <a href={href} aria-current={isActive ? "page" : undefined}>
      {label}
    </a>
  ),
}));
afterEach(cleanup);
describe("Bulk Update navigation", () => {
  it("places Bulk Update directly below CSV Import and marks its workspace route active", () => {
    state.admin = true;
    render(<WorkspaceSettingsSidebarItemCategories />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Exports",
      "CSV Import",
      "Bulk Update",
    ]);
    const link = screen.getByRole("link", { name: "Bulk Update" });
    expect(link.getAttribute("href")).toBe("/sync/settings/bulk-update");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
  it("hides Bulk Update from workspace Members", () => {
    state.admin = false;
    render(<WorkspaceSettingsSidebarItemCategories />);
    expect(screen.queryByRole("link", { name: "Bulk Update" })).toBeNull();
  });
});
