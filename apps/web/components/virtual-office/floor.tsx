import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@makeplane/propel/components/button";
import type { OfficeAction, OfficeDesk, OfficeState } from "../../services/virtual-office.service";
import { OfficeScene } from "./scene";

const codes = ["DEV", "QA", "PM", "UIUX", "BIZ", "AM", "LEAD"];
export function workstationLabel(office: OfficeState, desk: OfficeDesk) {
  const department = office.departments.find((d) => d.id === desk.department_id);
  return `${codes[department?.order ?? -1] ?? "DESK"}-${String(desk.number).padStart(2, "0")}`;
}

export function OfficeFloor({
  office,
  busy,
  act,
}: {
  office: OfficeState;
  busy: boolean;
  act: (action: OfficeAction) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignMember, setAssignMember] = useState("");
  const [listView, setListView] = useState(false);
  const myDesk = office.desks.find((d) => d.member_id === office.me.id);
  const departmentDesk = office.desks.find((d) => d.department_id === office.me.department_id && !d.member_id);
  const selected = office.desks.find((d) => d.id === selectedId) ?? myDesk ?? departmentDesk ?? office.desks[0];
  const member = office.members.find((m) => m.id === selected?.member_id);
  const admin = office.me.role !== "employee";
  const desks = office.desks.filter((d) => !filter || d.department_id === Number(filter));
  const canClaim = selected && !selected.member_id && selected.department_id === office.me.department_id;
  const selectedName = selected ? workstationLabel(office, selected) : "Select a workstation";
  const needDepartment = office.me.department_id === null;
  return (
    <div className="vo-office-layout">
      <section className="vo-office-canvas" aria-label="Office floor">
        {listView ? (
          <div className="vo-office-table" role="region" aria-label="Workstation list" tabIndex={0}>
            <table className="vo-table">
              <thead>
                <tr>
                  <th>Workstation</th>
                  <th>Department</th>
                  <th>Employee</th>
                  <th>Presence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {desks.map((desk) => {
                  const employee = office.members.find((m) => m.id === desk.member_id);
                  return (
                    <tr key={desk.id}>
                      <td>{workstationLabel(office, desk)}</td>
                      <td>{office.departments.find((d) => d.id === desk.department_id)?.name}</td>
                      <td>{employee?.name ?? "Available"}</td>
                      <td>{employee?.online ? "Online" : "Offline"}</td>
                      <td>
                        <button onClick={() => setSelectedId(desk.id)}>Select desk</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <OfficeScene office={office} selectedId={selected?.id ?? null} onSelect={(desk) => setSelectedId(desk.id)} />
        )}
      </section>
      <aside className="vo-office-directory" aria-label="Office directory" tabIndex={0}>
        <div className="vo-directory-heading">
          <h2>Office directory</h2>
          <button onClick={() => setListView(!listView)}>{listView ? "3D view" : "List view"}</button>
        </div>
        <p>Select a workstation to see its reservation. Time In and Time Out control your own avatar.</p>
        <label htmlFor="office-department-filter">Department</label>
        <select id="office-department-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All departments</option>
          {office.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({office.desks.filter((desk) => desk.department_id === d.id).length})
            </option>
          ))}
        </select>
        <div className="vo-directory-desks" role="region" aria-label="Workstation directory" tabIndex={0}>
          {desks.map((desk) => {
            const employee = office.members.find((m) => m.id === desk.member_id);
            return (
              <button
                key={desk.id}
                className={desk.id === selected?.id ? "selected" : ""}
                aria-pressed={desk.id === selected?.id}
                onClick={() => setSelectedId(desk.id)}
              >
                <i className={`vo-dot ${employee?.online ? "online" : ""}`} />
                <span>{workstationLabel(office, desk)}</span>
                <small>{employee ? (employee.online ? "Online" : "Offline") : "Available"}</small>
              </button>
            );
          })}
        </div>
        <section className="vo-directory-selection" aria-label="Selected workstation">
          <strong>{selectedName}</strong>
          <p>{member ? `Reserved by ${member.id === office.me.id ? "you" : member.name}` : "Available workstation"}</p>
          {canClaim && (
            <Button
              size="lg"
              stretch="full"
              variant="primary"
              label="Choose this desk"
              disabled={busy}
              onClick={() => void act({ action: "reserve", desk_id: selected.id })}
            />
          )}
          {selected && !selected.member_id && !canClaim && !needDepartment && (
            <p>Choose an available desk in your assigned department.</p>
          )}
          {admin && selected && (
            <details>
              <summary>Manage desk assignment</summary>
              <label htmlFor="desk-employee">Employee</label>
              <select id="desk-employee" value={assignMember} onChange={(event) => setAssignMember(event.target.value)}>
                <option value="">Choose employee</option>
                {office.members
                  .filter((m) => m.department_id === selected.department_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <div className="vo-assignment-actions">
                <Button
                  size="lg"
                  stretch="auto"
                  variant="primary"
                  label="Assign desk"
                  disabled={busy || !assignMember || !!selected.member_id}
                  onClick={() => void act({ action: "reserve", desk_id: selected.id, member_id: assignMember })}
                />
                {selected.member_id && (
                  <Button
                    size="lg"
                    stretch="auto"
                    variant="secondary"
                    label="Release desk"
                    disabled={busy}
                    onClick={() => void act({ action: "release", desk_id: selected.id })}
                  />
                )}
              </div>
            </details>
          )}
        </section>
        <section className="vo-directory-presence" aria-label="Your office presence">
          <strong>
            {office.me.name} · {office.me.online ? "Timed in" : "Timed out"}
          </strong>
          <p>
            {myDesk
              ? `Your reserved workstation: ${workstationLabel(office, myDesk)}`
              : needDepartment
                ? "Your department and job position must be assigned before you can choose a desk and time in."
                : "Choose an available desk in your department, then time in."}
          </p>
          {needDepartment &&
            (admin ? (
              <Link to="/virtual-office/admin/access">Set your department and position →</Link>
            ) : (
              <p>Contact your Virtual Office administrator to complete your setup.</p>
            ))}
          <div className="vo-presence-buttons">
            <Button
              size="lg"
              stretch="full"
              variant="primary"
              label="Time In"
              disabled={busy || !myDesk || office.me.online}
              onClick={() => void act({ action: "time_in" })}
            />
            <Button
              size="lg"
              stretch="full"
              variant="secondary"
              label="Time Out"
              disabled={busy || !office.me.online}
              onClick={() => void act({ action: "time_out" })}
            />
          </div>
        </section>
        <footer>Your reservation stays yours when you time out.</footer>
      </aside>
    </div>
  );
}
