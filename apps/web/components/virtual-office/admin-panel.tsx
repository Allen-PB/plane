import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { IdentityFields } from "./identity-fields";
import { ScheduleFields, ScheduleRequestReview } from "./work-schedule";
import type {
  OfficeAction,
  OfficeAdminState,
  OfficeMember,
  OfficeRole,
  OfficeState,
  WorkingDay,
  WorkArrangement,
} from "../../services/virtual-office.service";

export function AdminPanel({
  office,
  admin,
  query,
  setQuery,
  act,
  busy,
  refresh = async () => undefined,
}: {
  office: OfficeState;
  admin: OfficeAdminState;
  query: string;
  setQuery: (query: string) => void;
  act: (action: OfficeAction) => Promise<void>;
  busy: boolean;
  refresh?: () => Promise<unknown>;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<OfficeRole>("employee");
  const [departmentId, setDepartmentId] = useState("");
  const [jobRoleId, setJobRoleId] = useState("");
  const [active, setActive] = useState(true);
  const [arrangement, setArrangement] = useState<WorkArrangement | "">("");
  const [schedule, setSchedule] = useState<WorkingDay[]>([]);
  const [reviewMessage, setReviewMessage] = useState("");
  const selectedMember = admin.members.find((member) => member.user_id === userId);
  const pendingRequest = selectedMember
    ? admin.work?.[selectedMember.id]?.requests.find((request) => request.status === "pending")
    : undefined;
  const superAdmin = office.me.role === "super_admin";
  const editable = (member: OfficeMember) => superAdmin || member.role === "employee";
  function edit(member: OfficeMember) {
    setReviewMessage("");
    setUserId(member.user_id);
    setRole(member.role);
    const identity = admin.identities?.[member.user_id];
    setDepartmentId(String(identity?.department_id ?? member.department_id ?? ""));
    setJobRoleId(String(identity?.job_role_id ?? member.job_role_id ?? ""));
    setActive(member.active);
    setArrangement(admin.work?.[member.id]?.arrangement ?? "");
    setSchedule(admin.work?.[member.id]?.schedule ?? []);
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
            ...(jobRoleId ? { job_role_id: Number(jobRoleId) } : {}),
            active,
            ...(arrangement
              ? {
                  arrangement,
                  policy_id: selectedMember ? (admin.work?.[selectedMember.id]?.policy_id ?? null) : null,
                  schedule: arrangement === "scheduled" ? schedule : [],
                }
              : {}),
          });
        }}
      >
        <h2>Employee access</h2>
        {reviewMessage && <p role="status">{reviewMessage}</p>}
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
            setReviewMessage("");
            const id = event.target.value;
            const existing = admin.members.find((member) => member.user_id === id);
            if (existing) edit(existing);
            else {
              setUserId(id);
              setRole("employee");
              const identity = admin.users.find((user) => user.id === id)?.identity;
              setDepartmentId(String(identity?.department_id ?? ""));
              setJobRoleId(String(identity?.job_role_id ?? ""));
              setActive(true);
              setArrangement("");
              setSchedule([]);
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
        <IdentityFields
          prefix="office"
          departments={office.departments}
          jobRoles={admin.job_roles ?? []}
          departmentId={departmentId}
          jobRoleId={jobRoleId}
          required={role === "employee" && active}
          onChange={(department, jobRole) => {
            setDepartmentId(department);
            setJobRoleId(jobRole);
          }}
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
        <label htmlFor="office-arrangement">Attendance arrangement</label>
        <select
          id="office-arrangement"
          value={arrangement}
          required={active && (!selectedMember || !selectedMember.active)}
          disabled={busy}
          onChange={(event) => setArrangement(event.target.value as WorkArrangement | "")}
        >
          <option value="" disabled={!!(selectedMember && admin.work?.[selectedMember.id]?.arrangement)}>
            Arrangement not configured
          </option>
          <option value="scheduled">Scheduled shift</option>
          <option value="output_based">Output-based</option>
        </select>
        {arrangement === "scheduled" && (
          <ScheduleFields prefix="admin-schedule" value={schedule} onChange={setSchedule} disabled={busy || !active} />
        )}
        <p>Schedule changes apply from the next shift. A direct change supersedes any pending schedule request.</p>
        {pendingRequest && (
          <ScheduleRequestReview
            key={`${pendingRequest.id}-${pendingRequest.revision}`}
            request={pendingRequest}
            refresh={async () => {
              // A decision changes approved policy. Clear the old editor so a
              // later identity save cannot unknowingly restore its old hours.
              setUserId("");
              setRole("employee");
              setDepartmentId("");
              setJobRoleId("");
              setActive(true);
              setArrangement("");
              setSchedule([]);
              setReviewMessage("Schedule decision saved. Select the account again to review its latest settings.");
              return refresh();
            }}
          />
        )}
        <p className="vo-info">
          Department and job Role changes take effect at the next Time In. Revoking access ends attendance and releases
          the desk immediately.
        </p>
        <Button
          size="lg"
          stretch="auto"
          variant="primary"
          label="Save employee access"
          type="submit"
          disabled={busy || (active && arrangement === "scheduled" && schedule.length === 0)}
        />
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
                    {member.identity_pending && <p>Change pending until next Time In</p>}
                    {admin.work?.[member.id]?.requests.some((request) => request.status === "pending") && (
                      <p className="vo-pill">Pending schedule request</p>
                    )}
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
