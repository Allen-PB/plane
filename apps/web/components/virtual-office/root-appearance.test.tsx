import type { ReactNode } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import VirtualOfficeRoot from "./root";

const state = vi.hoisted(() => ({
  role: "employee" as "employee" | "admin" | "super_admin",
  action: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/wrappers/authentication-wrapper", () => ({
  AuthenticationWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./floor", () => ({ OfficeFloor: () => <div>Office floor scene</div> }));
vi.mock("./admin-panel", () => ({ AdminPanel: () => null }));
vi.mock("./presence-export", () => ({
  PresenceExport: ({ onClose }: { onClose: () => void }) => (
    <section aria-label="Export attendance">
      <button onClick={onClose}>Cancel export</button>
    </section>
  ),
}));
vi.mock("../../services/virtual-office.service", () => ({ virtualOfficeService: { action: state.action } }));
vi.mock("swr", () => ({
  default: (key: unknown) => ({
    data:
      key === "virtual-office-status"
        ? { allowed: true }
        : key === "virtual-office"
          ? {
              name: "Office",
              appearance_mode: "automatic",
              me: { id: "me", role: state.role, online: false, timed_in_at: null },
              members: [],
              departments: [],
              desks: [],
            }
          : undefined,
    mutate: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("office scene control access", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["employee", "admin", "super_admin"] as const)(
    "shows appearance controls only to office admins: %s",
    (role) => {
      state.role = role;
      const { container } = render(
        <MemoryRouter>
          <VirtualOfficeRoot />
        </MemoryRouter>
      );
      expect(Boolean(screen.queryByLabelText("Office scene appearance"))).toBe(role !== "employee");
      expect(container.querySelector(".vo-app")?.hasAttribute("data-office-theme")).toBe(false);
    }
  );
  it("saves admin overrides through the server rather than browser preferences", async () => {
    state.role = "admin";
    render(
      <MemoryRouter>
        <VirtualOfficeRoot />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Office scene appearance"), { target: { value: "night" } });
    await waitFor(() => expect(state.action).toHaveBeenCalledWith({ action: "appearance", appearance_mode: "night" }));
  });
  it("automatically dismisses the success message", async () => {
    vi.useFakeTimers();
    state.role = "admin";
    render(
      <MemoryRouter>
        <VirtualOfficeRoot />
      </MemoryRouter>
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Office scene appearance"), { target: { value: "day" } });
    });
    expect(screen.getByText("Office updated.")).toBeDefined();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByText("Office updated.")).toBeNull();
  });
  it("clears messages when navigating and opens CSV from the management navigation", async () => {
    state.role = "admin";
    render(
      <MemoryRouter>
        <VirtualOfficeRoot />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Office scene appearance"), { target: { value: "day" } });
    await screen.findByText("Office updated.");
    fireEvent.click(screen.getByRole("link", { name: "Office management" }));
    expect(screen.queryByText("Office updated.")).toBeNull();
    const csv = screen.getByRole("link", { name: "Download Time In/Out CSV" });
    expect(csv.closest("nav")?.getAttribute("aria-label")).toBe("Office management sections");
    expect(screen.queryByRole("button", { name: "Download Time In/Out CSV" })).toBeNull();
    fireEvent.click(csv);
    expect(screen.getByRole("region", { name: "Export attendance" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(screen.queryByRole("region", { name: "Export attendance" })).toBeNull();
    fireEvent.click(csv);
    fireEvent.click(screen.getByRole("link", { name: "Office settings" }));
    expect(screen.queryByRole("region", { name: "Export attendance" })).toBeNull();
  });
  it("does not show a stale success message when a save finishes after navigation", async () => {
    state.role = "admin";
    let finish!: () => void;
    state.action.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(
      <MemoryRouter>
        <VirtualOfficeRoot />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Office scene appearance"), { target: { value: "day" } });
    fireEvent.click(screen.getByRole("link", { name: "Office management" }));
    await act(async () => {
      finish();
    });
    expect(screen.queryByText("Office updated.")).toBeNull();
  });
});
