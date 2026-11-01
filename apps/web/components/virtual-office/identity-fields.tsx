import type { OfficeDepartment, OfficeJobRole } from "../../services/virtual-office.service";

export function IdentityFields({
  departments,
  jobRoles,
  departmentId,
  jobRoleId,
  onChange,
  disabled = false,
  required = true,
  prefix,
}: {
  departments: OfficeDepartment[];
  jobRoles: OfficeJobRole[];
  departmentId: string;
  jobRoleId: string;
  onChange: (departmentId: string, jobRoleId: string) => void;
  disabled?: boolean;
  required?: boolean;
  prefix: string;
}) {
  const roles = jobRoles.filter(
    (role) => role.department_id === Number(departmentId) && (!role.archived || String(role.id) === jobRoleId)
  );
  return (
    <>
      <label htmlFor={`${prefix}-department`}>Department</label>
      <select
        id={`${prefix}-department`}
        required={required}
        disabled={disabled}
        value={departmentId}
        onChange={(event) => onChange(event.target.value, "")}
      >
        <option value="">Select a department</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${prefix}-job-role`}>Job Role</label>
      <select
        id={`${prefix}-job-role`}
        required={required}
        disabled={disabled || !departmentId}
        value={jobRoleId}
        onChange={(event) => onChange(departmentId, event.target.value)}
      >
        <option value="">Select a job role</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
            {role.archived ? " (Archived)" : ""}
          </option>
        ))}
      </select>
      {departmentId && roles.length === 0 && <p>No job roles are available. Contact an office Super Admin.</p>}
    </>
  );
}
