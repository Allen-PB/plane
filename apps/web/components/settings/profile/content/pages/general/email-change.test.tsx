import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProfileEmailChange } from "./email-change";
vi.mock("@/components/core/modals/change-email-modal", () => ({
  ChangeEmailModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="Change email">
        <button onClick={onClose}>Cancel email change</button>
      </div>
    ) : null,
}));
it.each(["employee", "admin"])("does not expose email change or a modal for %s", (_role) => {
  render(<ProfileEmailChange allowed={false} smtpConfigured label="Change email" />);
  expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("allows the existing owner flow only while permission and SMTP are available", async () => {
  const { rerender } = render(<ProfileEmailChange allowed smtpConfigured label="Change email" />);
  await userEvent.click(screen.getByRole("button", { name: "Change email" }));
  expect(screen.getByRole("dialog", { name: "Change email" })).toBeTruthy();
  rerender(<ProfileEmailChange allowed={false} smtpConfigured label="Change email" />);
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<ProfileEmailChange allowed smtpConfigured={false} label="Change email" />);
  expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
});
