import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { beforeEach, expect, it, vi } from "vitest";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import { ProfileOfficeIdentity } from "./profile-identity";

vi.mock("../../services/virtual-office.service", () => ({
  virtualOfficeService: { profile: vi.fn(), saveProfile: vi.fn(), readNotice: vi.fn() },
}));
const data = {
  department_id: 1,
  job_role_id: 1,
  job_role_name: "Developer",
  locked: false,
  pending: false,
  departments: [{ id: 1, name: "Development", color: "#123456", order: 0 }],
  job_roles: [{ id: 1, department_id: 1, name: "Developer", archived: false }],
  notices: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.profile).mockResolvedValue(data);
});
function profile() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ProfileOfficeIdentity />
    </SWRConfig>
  );
}
it("saves dropdown IDs through the protected identity API", async () => {
  vi.mocked(service.saveProfile).mockResolvedValue(data);
  profile();
  await screen.findByLabelText("Job Role");
  await userEvent.click(screen.getByRole("button", { name: "Save department and job role" }));
  await waitFor(() => expect(service.saveProfile).toHaveBeenCalledWith({ department_id: 1, job_role_id: 1 }));
});
it("shows pending details read-only after office access and does not expose a save action", async () => {
  vi.mocked(service.profile).mockResolvedValue({ ...data, locked: true, pending: true });
  profile();
  expect(((await screen.findByLabelText("Department")) as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Save department and job role" })).toBeNull();
  expect(screen.getByText(/take effect at your next Time In/)).toBeTruthy();
});

const notices = [
  {
    id: 31,
    message: "Your working schedule was updated. New hours apply from the next shift.",
    href: "/settings/profile/general/",
    created_at: "2026-11-02T00:00:00Z",
  },
  { id: 32, message: "Your department or job role was updated.", href: "", created_at: "2026-11-02T00:00:00Z" },
];

it("does not reserve notification space when there are no unread updates", async () => {
  profile();
  await screen.findByLabelText("Job Role");
  expect(screen.queryByRole("region", { name: "Office notifications" })).toBeNull();
});

it("groups multiple updates with separately labeled review and dismiss actions", async () => {
  vi.mocked(service.profile).mockResolvedValue({ ...data, notices });
  profile();
  const panel = await screen.findByRole("region", { name: "Office notifications" });
  expect(within(panel).getByRole("heading", { name: "Your account updates" })).toBeTruthy();
  expect(within(panel).getByText("2 unread")).toBeTruthy();
  const rows = within(panel).getAllByRole("status");
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector("time")?.getAttribute("datetime")).toBe(notices[0].created_at);
  expect(rows[0].querySelector("time")?.textContent).toContain("Asia/Manila");
  expect(within(rows[0]).getByRole("link", { name: "Review details" }).getAttribute("href")).toBe(
    "/settings/profile/general/"
  );
  expect(within(rows[1]).queryByRole("link")).toBeNull();
  expect(within(panel).getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(2);
  expect(within(panel).getByRole("region", { name: "Unread office updates" }).tabIndex).toBe(0);
});

it("dismisses only the selected update and refreshes the unread list", async () => {
  vi.mocked(service.profile).mockResolvedValue({ ...data, notices });
  vi.mocked(service.readNotice).mockImplementation(async () => {
    vi.mocked(service.profile).mockResolvedValue({ ...data, notices: [notices[1]] });
  });
  profile();
  const row = (await screen.findAllByRole("status"))[0];
  await userEvent.click(within(row).getByRole("button", { name: "Dismiss notification" }));
  await waitFor(() => expect(service.readNotice).toHaveBeenCalledWith(31));
  await waitFor(() => expect(screen.queryByText(notices[0].message)).toBeNull());
  expect(screen.getByText(notices[1].message)).toBeTruthy();
});

it("retains failed updates and restores the dismiss action for retry", async () => {
  vi.mocked(service.profile).mockResolvedValue({ ...data, notices: [notices[0]] });
  vi.mocked(service.readNotice).mockRejectedValue(new Error("unavailable"));
  profile();
  const button = await screen.findByRole("button", { name: "Dismiss notification" });
  await userEvent.click(button);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Could not dismiss");
  expect(screen.getByText(notices[0].message)).toBeTruthy();
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
});

it("uses employee-facing administrator wording when no job roles are available", async () => {
  vi.mocked(service.profile).mockResolvedValue({ ...data, job_roles: [] });
  profile();
  expect(await screen.findByText("No job roles are available. Contact an office administrator.")).toBeTruthy();
  expect(screen.queryByText(/super admin/i)).toBeNull();
});
