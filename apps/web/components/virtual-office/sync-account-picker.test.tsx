import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SyncAccountPicker } from "./sync-account-picker";
import type { OfficeAdminState } from "../../services/virtual-office.service";
const admin: OfficeAdminState = {
  users: [{ id: "one", email: "employee@example.invalid", display_name: "Employee" }],
  members: [],
  audit: [],
};
function Picker({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  return (
    <SyncAccountPicker
      admin={admin}
      value={value}
      onChange={setValue}
      query={query}
      setQuery={setQuery}
      disabled={disabled}
    />
  );
}
it("supports keyboard selection and Escape without submitting a form", async () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Picker />
    </form>
  );
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Sync account"));
  const search = await screen.findByLabelText("Find a Sync account by email");
  await waitFor(() => expect(document.activeElement).toBe(search));
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(screen.getByLabelText("Sync account").textContent).toContain("employee@example.invalid"));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await user.click(screen.getByLabelText("Sync account"));
  const reopenedSearch = await screen.findByLabelText("Find a Sync account by email");
  await waitFor(() => expect(document.activeElement).toBe(reopenedSearch));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
});
it("keeps the selected member visible when server search results change", async () => {
  const setQuery = vi.fn();
  const props = { admin, value: "one", onChange: vi.fn(), query: "", setQuery, disabled: false };
  const { rerender } = render(<SyncAccountPicker {...props} />);
  await userEvent.click(screen.getByLabelText("Sync account"));
  await userEvent.type(await screen.findByLabelText("Find a Sync account by email"), "x");
  expect(setQuery).toHaveBeenCalledWith("x", expect.anything());
  rerender(
    <SyncAccountPicker
      {...props}
      query="x"
      admin={{
        ...admin,
        users: [],
        members: [{ id: "member", user_id: "one", name: "Employee" } as OfficeAdminState["members"][number]],
      }}
    />
  );
  expect(screen.getByLabelText("Sync account").textContent).toContain("Employee");
  expect(screen.getByText("No matching accounts.")).toBeTruthy();
});
it("prevents opening the account picker while saving", async () => {
  render(<Picker disabled />);
  const trigger = screen.getByLabelText("Sync account") as HTMLButtonElement;
  expect(trigger.disabled).toBe(true);
  await userEvent.click(trigger);
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
});
