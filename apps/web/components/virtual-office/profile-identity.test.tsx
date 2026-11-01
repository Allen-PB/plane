import { render, screen, waitFor } from "@testing-library/react";
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
