import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import type { OfficeDepartment, OfficeJobRole } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";

function RoleEditor({
  role,
  busy,
  save,
}: {
  role: OfficeJobRole;
  busy: boolean;
  save: (data: { id: number; name?: string; archived?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(role.name);
  return (
    <form
      className="vo-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save({ id: role.id, name });
      }}
    >
      <label htmlFor={`job-role-${role.id}`}>Job Role{role.archived ? " (Archived)" : ""}</label>
      <input
        id={`job-role-${role.id}`}
        value={name}
        required
        maxLength={300}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        size="sm"
        variant="primary"
        stretch="auto"
        type="submit"
        label="Rename role"
        disabled={busy || !name.trim()}
      />
      <Button
        size="sm"
        variant="secondary"
        stretch="auto"
        type="button"
        label={role.archived ? "Restore role" : "Archive role"}
        disabled={busy}
        onClick={() => void save({ id: role.id, archived: !role.archived })}
      />
    </form>
  );
}

export function JobRoleCatalog({
  departments,
  roles,
  refresh,
}: {
  departments: OfficeDepartment[];
  roles: OfficeJobRole[];
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(data: { id?: number; department_id?: number; name?: string; archived?: boolean }) {
    setBusy(true);
    setMessage("");
    try {
      await service.saveJobRole(data);
      await refresh();
      setMessage("Job roles updated.");
    } catch {
      setMessage("Could not save this job role. Check for a duplicate name and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="vo-card vo-panel" aria-label="Job role catalog">
      <h2>Job roles by department</h2>
      <p>Archived roles remain on existing assignments and historical attendance.</p>
      {message && <p role="status">{message}</p>}
      {departments.map((department) => (
        <details key={department.id}>
          <summary>{department.name}</summary>
          {roles
            .filter((role) => role.department_id === department.id)
            .map((role) => (
              <RoleEditor key={`${role.id}-${role.name}`} role={role} busy={busy} save={save} />
            ))}
          <form
            className="vo-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get("name") ?? "").trim();
              if (name) void save({ department_id: department.id, name });
            }}
          >
            <label htmlFor={`new-job-role-${department.id}`}>New job Role</label>
            <input id={`new-job-role-${department.id}`} name="name" required maxLength={300} disabled={busy} />
            <Button
              size="sm"
              variant="primary"
              stretch="auto"
              type="submit"
              label={`Add role to ${department.name}`}
              disabled={busy}
            />
          </form>
        </details>
      ))}
    </section>
  );
}
