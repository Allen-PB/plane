import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import type {
  OfficeAction,
  OfficeAdminState,
  OfficeMember,
  OfficeRole,
  OfficeState,
} from "../../services/virtual-office.service";

export function AdminPanel({
  office,
  admin,
  query,
  setQuery,
  act,
  busy,
}: {
  office: OfficeState;
  admin: OfficeAdminState;
  query: string;
  setQuery: (query: string) => void;
  act: (action: OfficeAction) => Promise<void>;
  busy: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<OfficeRole>("employee");
  const [departmentId, setDepartmentId] = useState("");
  const [position, setPosition] = useState("");
  const [active, setActive] = useState(true);
  const superAdmin = office.me.role === "super_admin";
  const editable = (member: OfficeMember) => superAdmin || member.role === "employee";
  function edit(member: OfficeMember) {
    setUserId(member.user_id);
    setRole(member.role);
    setDepartmentId(String(member.department_id ?? ""));
    setPosition(member.position);
    setActive(member.active);
  }
  return (
    <div className="vo-admin-grid">
      <form
        className="vo-card vo-panel vo-form"
        onSubmit={(event) => {
          event.preventDefault();
          void act({
            action: "member",
            user_id: userId,
            role,
            department_id: departmentId ? Number(departmentId) : null,
            position,
            active,
          });
        }}
      >
        <h2>Employee access</h2>
        <p className="vo-info">Choose an existing Sync account. Office roles are independent of Sync permissions.</p>
        <label htmlFor="office-search">Find a Sync account by email</label>
        <input
          id="office-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search email…"
        />
        <label htmlFor="office-user">Sync account</label>
        <select
          id="office-user"
          required
          value={userId}
          onChange={(event) => {
            const id = event.target.value;
            const existing = admin.members.find((member) => member.user_id === id);
            if (existing) edit(existing);
            else {
              setUserId(id);
              setRole("employee");
              setDepartmentId("");
              setPosition("");
              setActive(true);
            }
          }}
        >
          <option value="">Select an account</option>
          {userId && !admin.users.some((u) => u.id === userId) && (
            <option value={userId}>{admin.members.find((m) => m.user_id === userId)?.name ?? userId}</option>
          )}
          {admin.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
        <label htmlFor="office-role">Virtual Office role</label>
        <select id="office-role" value={role} onChange={(event) => setRole(event.target.value as OfficeRole)}>
          <option value="employee">Employee</option>
          {superAdmin && (
            <>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </>
          )}
        </select>
        <label htmlFor="office-department">Department</label>
        <select
          id="office-department"
          required={role === "employee"}
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value="">Unassigned</option>
          {office.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label htmlFor="office-position">Job position</label>
        <input
          id="office-position"
          required={role === "employee"}
          value={position}
          maxLength={120}
          onChange={(event) => setPosition(event.target.value)}
        />
        <label htmlFor="office-active">Access</label>
        <select
          id="office-active"
          value={active ? "active" : "revoked"}
          onChange={(event) => setActive(event.target.value === "active")}
        >
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <p className="vo-info">
          Changing department or revoking access releases the employee's desk and ends presence.
        </p>
        <Button size="lg" stretch="auto" variant="primary" label="Save employee access" type="submit" disabled={busy} />
      </form>
      <section className="vo-card">
        <div className="vo-card-head">OFFICE DIRECTORY · {admin.members.length} PEOPLE</div>
        <div className="vo-table-wrap">
          <table className="vo-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department / position</th>
                <th>Role / access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admin.members.map((member) => (
                <tr key={member.id}>
                  <td>
                    {member.name}
                    <br />
                    <span className="vo-muted">{admin.users.find((user) => user.id === member.user_id)?.email}</span>
                  </td>
                  <td>
                    {office.departments.find((d) => d.id === member.department_id)?.name ?? "Unassigned"}
                    <br />
                    <span className="vo-muted">{member.position}</span>
                  </td>
                  <td>
                    {member.role.replaceAll("_", " ")}
                    <br />
                    <span className="vo-muted">{member.active ? "Active" : "Revoked"}</span>
                  </td>
                  <td>{editable(member) && <button onClick={() => edit(member)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
