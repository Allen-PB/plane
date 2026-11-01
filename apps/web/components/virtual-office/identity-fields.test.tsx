import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { IdentityFields } from "./identity-fields";

const departments = [
  { id: 1, name: "Development", color: "#123456", order: 0 },
  { id: 2, name: "Leadership", color: "#123456", order: 1 },
];
const jobRoles = [
  { id: 1, department_id: 1, name: "Developer", archived: false },
  { id: 2, department_id: 2, name: "Director", archived: false },
  { id: 3, department_id: 1, name: "Retired title", archived: true },
];
function Form() {
  const [department, setDepartment] = useState("1");
  const [role, setRole] = useState("1");
  return (
    <IdentityFields
      prefix="test"
      departments={departments}
      jobRoles={jobRoles}
      departmentId={department}
      jobRoleId={role}
      onChange={(nextDepartment, nextRole) => {
        setDepartment(nextDepartment);
        setRole(nextRole);
      }}
    />
  );
}
it("filters roles, hides archived choices and clears incompatible selections when department changes", async () => {
  render(<Form />);
  expect(screen.getByRole("option", { name: "Developer" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Director" })).toBeNull();
  expect(screen.queryByRole("option", { name: /Retired/ })).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Department"), "2");
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).value).toBe("");
  expect(screen.getByRole("option", { name: "Director" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Developer" })).toBeNull();
});
it("retains an archived assignment visibly while locking post-access Profile fields", () => {
  render(
    <IdentityFields
      prefix="test"
      departments={departments}
      jobRoles={jobRoles}
      departmentId="1"
      jobRoleId="3"
      disabled
      onChange={() => undefined}
    />
  );
  expect((screen.getByLabelText("Department") as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText("Job Role") as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByRole("option", { name: "Retired title (Archived)" })).toBeTruthy();
});
