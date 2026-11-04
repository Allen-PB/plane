import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProfileSettingsLayout } from "./layout";

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => (key === "profile_settings" ? "Profile settings" : key) }),
}));
vi.mock("./sidebar", () => ({
  ProfileSettingsSidebarRoot: ({ updateActiveTab }: { updateActiveTab: (tab: string) => void }) => (
    <button type="button" onClick={() => updateActiveTab("preferences")}>
      Preferences
    </button>
  ),
}));
vi.mock("./content", () => ({
  ProfileSettingsContent: ({ activeTab }: { activeTab: string }) => <p>Content: {activeTab}</p>,
}));

it("opens navigation, selects a section and returns keyboard focus to its toggle", async () => {
  const change = vi.fn();
  render(<ProfileSettingsLayout activeTab="general" updateActiveTab={change} />);
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Profile settings" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Preferences" }));
  expect(change).toHaveBeenCalledWith("preferences");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);
});

it("closes navigation with Escape without changing the active section", async () => {
  const change = vi.fn();
  render(<ProfileSettingsLayout activeTab="general" updateActiveTab={change} />);
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Profile settings" });
  await user.click(toggle);
  screen.getByRole("button", { name: "Preferences" }).focus();
  await user.keyboard("{Escape}");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(change).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(toggle);
});
