import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSidebarItemCategories } from "./item-categories";

const state = vi.hoisted(() => ({ setting: undefined as undefined | { instance_enabled: boolean } }));
vi.mock("react-router", () => ({ useParams: () => ({ workspaceSlug: "sync" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/sync/settings/projects/p1/states/" }));
vi.mock("@plane/i18n", () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock("@plane/constants", () => ({
  EUserPermissionsLevel: { PROJECT: "project" },
  PROJECT_SETTINGS_CATEGORIES: ["work-structure"],
  PROJECT_SETTINGS_CATEGORY_LABELS: { "work-structure": "Work Structure" },
  GROUPED_PROJECT_SETTINGS: {
    "work-structure": [
      { key: "workflow", href: "/workflow", access: [20], i18n_label: "Workflow" },
      { key: "structured_updates", href: "/structured-updates", access: [20], i18n_label: "Structured updates" },
      { key: "states", href: "/states", access: [20], i18n_label: "States" },
    ],
  },
}));
vi.mock("@/hooks/store/user", () => ({ useUserPermissions: () => ({ allowPermissions: () => true }) }));
vi.mock("@/components/structured-updates/use-structured-updates", () => ({
  useStructuredUpdateSetting: () => ({ data: state.setting }),
}));
vi.mock("./item-icon", () => ({ PROJECT_SETTINGS_ICONS: {} }));
vi.mock("@/components/settings/sidebar/item", () => ({
  SettingsSidebarItem: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
}));
afterEach(cleanup);

const labels = () => screen.getAllByRole("link").map((link) => link.textContent);

describe("Structured updates in project settings", () => {
  it("is listed under Work Structure when the God Mode switch is on", () => {
    state.setting = { instance_enabled: true };
    render(<ProjectSettingsSidebarItemCategories projectId="p1" />);
    expect(labels()).toEqual(["Workflow", "Structured updates", "States"]);
  });

  it("is hidden when the God Mode switch is off", () => {
    state.setting = { instance_enabled: false };
    render(<ProjectSettingsSidebarItemCategories projectId="p1" />);
    expect(labels()).toEqual(["Workflow", "States"]);
  });

  it("stays hidden until the setting has loaded", () => {
    state.setting = undefined;
    render(<ProjectSettingsSidebarItemCategories projectId="p1" />);
    expect(labels()).toEqual(["Workflow", "States"]);
  });
});
