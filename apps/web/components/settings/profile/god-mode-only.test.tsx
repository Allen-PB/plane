import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, expect, it, vi } from "vitest";
import { GodModeOnly } from "./god-mode-only";

const state = vi.hoisted(() => ({ user: { id: "employee" } as { id: string } | null, status: vi.fn() }));
vi.mock("@/hooks/store/user", () => ({ useUser: () => ({ data: state.user }) }));
vi.mock("@/services/user.service", () => ({
  UserService: class {
    currentUserInstanceAdminStatus = state.status;
  },
}));
beforeEach(() => {
  state.user = { id: "employee" };
  state.status.mockReset();
});
function Menu() {
  return (
    <GodModeOnly>
      <a href="/create-workspace">Create workspace</a>
      <a href="/invitations">Workspace invites</a>
    </GodModeOnly>
  );
}
function setup() {
  const cache = new Map();
  return render(<Menu />, {
    wrapper: ({ children }) => <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{children}</SWRConfig>,
  });
}
it("hides actions while permission is pending, then shows them only for an instance admin", async () => {
  let resolve!: (value: { is_instance_admin: boolean }) => void;
  state.status.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  setup();
  expect(screen.queryByRole("link")).toBeNull();
  resolve({ is_instance_admin: true });
  expect(await screen.findByRole("link", { name: "Create workspace" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Workspace invites" })).toBeTruthy();
});
it.each([false, "error"])("hides actions when instance permission is %s", async (result) => {
  if (result === "error") state.status.mockRejectedValue(new Error("Permission unavailable"));
  else state.status.mockResolvedValue({ is_instance_admin: false });
  setup();
  await waitFor(() => expect(state.status).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("link")).toBeNull();
});
it("does not retain an owner's visible actions when the signed-in account changes", async () => {
  state.status.mockResolvedValueOnce({ is_instance_admin: true }).mockReturnValue(new Promise(() => {}));
  const view = setup();
  await screen.findByRole("link", { name: "Create workspace" });
  state.user = { id: "different-employee" };
  view.rerender(<Menu />);
  expect(screen.queryByRole("link")).toBeNull();
});
it("does not request permission or render actions when signed out", () => {
  state.user = null;
  setup();
  expect(state.status).not.toHaveBeenCalled();
  expect(screen.queryByRole("link")).toBeNull();
});
