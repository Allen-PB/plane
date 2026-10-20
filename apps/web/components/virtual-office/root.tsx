import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useLocation } from "react-router";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type {
  OfficeAction,
  OfficeAdminState,
  OfficeMember,
  OfficeRole,
  OfficeState,
} from "../../services/virtual-office.service";
import { OfficeScene } from "./scene";
// CSS is scoped under .vo-app to keep the rest of Sync unchanged.
// oxlint-disable-next-line import/no-unassigned-import
import "./office.css";

function errorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string")
      return data.detail;
    if (error.response?.status === 400) return "Check the required fields, department, and job position.";
    if (error.response?.status === 403) return "Your account does not have permission for this action.";
  }
  return "Could not reach the office. Please try again.";
}

function OfficeContent() {
  const { pathname } = useLocation();
  const adminPage = pathname.includes("/admin");
  const settingsPage = pathname.endsWith("/settings");
  const { data: status, error: statusError } = useSWR("virtual-office-status", () => service.status(), {
    refreshInterval: 15000,
  });
  const {
    data: office,
    error,
    mutate,
  } = useSWR(status?.allowed ? "virtual-office" : null, () => service.state(), {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });
  const isAdmin = office?.me.role === "admin" || office?.me.role === "super_admin";
  const [query, setQuery] = useState("");
  const { data: admin, mutate: mutateAdmin } = useSWR(
    adminPage && isAdmin ? ["virtual-office-admin", query] : null,
    () => service.admin(query)
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignMember, setAssignMember] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [view, setView] = useState<"scene" | "list">("scene");

  useEffect(() => {
    if (!status?.allowed || !office?.me.online) return;
    const timer = window.setInterval(() => {
      void service
        .action({ action: "heartbeat" })
        .catch((heartbeatError: unknown) => setMessage(errorMessage(heartbeatError)));
    }, 25000);
    return () => window.clearInterval(timer);
  }, [status?.allowed, office?.me.online]);

  async function act(action: OfficeAction) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await service.action(action);
      await Promise.all([mutate(), mutateAdmin()]);
      setMessage("Office updated.");
    } catch (actionError: unknown) {
      setMessage(errorMessage(actionError));
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  const selected = office?.desks.find((d) => d.id === selectedId);
  const occupant = office?.members.find((m) => m.id === selected?.member_id);
  const myDesk = office?.desks.find((d) => d.member_id === office.me.id);
  const department = office?.departments.find((d) => d.id === office.me.department_id);

  return (
    <div className="vo-app">
      <header className="vo-header">
        <Link to="/virtual-office" className="vo-brand">
          <img src="/branding/pathbuilder-mark.svg" alt="" />
          <div>
            <span className="vo-eyebrow">PathBuilder Sync</span>
            <strong>
              Virtual Office<span style={{ color: "#4775e7" }}>.</span>
            </strong>
          </div>
        </Link>
        <nav className="vo-nav" aria-label="Virtual Office">
          <Link to="/virtual-office" aria-current={!adminPage ? "page" : undefined}>
            Office floor
          </Link>
          {isAdmin && (
            <Link to="/virtual-office/admin/access" aria-current={adminPage ? "page" : undefined}>
              Office management
            </Link>
          )}
          <Link to="/">Back to Sync ↗</Link>
        </nav>
      </header>
      {!status && !statusError ? (
        <p className="vo-empty">Loading your office…</p>
      ) : statusError ? (
        <div className="vo-empty" role="alert">
          {errorMessage(statusError)}
        </div>
      ) : !status?.allowed ? (
        <div className="vo-card vo-empty">
          <span className="vo-eyebrow">Your next chapter starts here</span>
          <h1>Welcome to Virtual Office</h1>
          <p className="vo-info">
            Your Sync account is ready. An office administrator needs to grant Virtual Office access and assign your
            department and position.
          </p>
          <p className="vo-info">
            Setting up the office for the first time? Your deployment operator must designate the first Virtual Office
            Super Admin.
          </p>
        </div>
      ) : error ? (
        <div className="vo-empty" role="alert">
          {errorMessage(error)} <button onClick={() => void mutate()}>Retry</button>
        </div>
      ) : !office ? (
        <p className="vo-empty">Opening the office…</p>
      ) : (
        <main className="vo-main">
          <div className="vo-intro">
            <div>
              <span className="vo-eyebrow">One team. Endless possibilities.</span>
              <h1>{adminPage ? "Make room for great work." : "A little closer, wherever you work."}</h1>
              <p className="vo-muted">{office.name} · 39 desks · 7 departments</p>
            </div>
            <div className="vo-actions">
              <span className="vo-pill">{office.members.filter((m) => m.online).length} in the office</span>
              <Button
                size="lg"
                stretch="auto"
                label={office.me.online ? "Time out" : "Time in"}
                variant={office.me.online ? "secondary" : "primary"}
                disabled={busy || (!myDesk && !office.me.online)}
                onClick={() => void act({ action: office.me.online ? "time_out" : "time_in" })}
              />
            </div>
          </div>
          {message && (
            <div className="vo-message" role="status">
              {message}
            </div>
          )}
          {adminPage ? (
            !isAdmin ? (
              <div className="vo-card vo-panel" role="alert">
                Office administrator access required.
              </div>
            ) : (
              <>
                <nav className="vo-nav" style={{ marginBottom: 20 }}>
                  <Link to="/virtual-office/admin/access">People & access</Link>
                  <Link to="/virtual-office/admin/settings">Office settings</Link>
                  <Link to="/virtual-office">Desk assignments ↗</Link>
                </nav>
                {settingsPage ? (
                  <div className="vo-side">
                    {office.me.role === "super_admin" && (
                      <form
                        className="vo-card vo-panel vo-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void act({ action: "settings", name: officeName });
                        }}
                      >
                        <h2>Office identity</h2>
                        <label htmlFor="office-name">Office name</label>
                        <input
                          id="office-name"
                          maxLength={120}
                          required
                          value={officeName}
                          placeholder={office.name}
                          onChange={(event) => setOfficeName(event.target.value)}
                        />
                        <Button
                          size="lg"
                          stretch="auto"
                          variant="primary"
                          label="Save settings"
                          type="submit"
                          disabled={busy}
                        />
                      </form>
                    )}
                    <section className="vo-card vo-panel">
                      <h2>Departments</h2>
                      <p className="vo-info">
                        Manage department names and colors. The seven sections retain their fixed 39-desk capacity.
                      </p>
                      {office.departments.map((d) => (
                        <form
                          key={`${d.id}-${d.name}-${d.color}`}
                          className="vo-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            void act({
                              action: "department",
                              department_id: d.id,
                              name: String(form.get("name")),
                              color: String(form.get("color")),
                            });
                          }}
                        >
                          <label htmlFor={`department-name-${d.id}`}>Department {d.order + 1}</label>
                          <input
                            id={`department-name-${d.id}`}
                            name="name"
                            required
                            maxLength={80}
                            defaultValue={d.name}
                          />
                          <label htmlFor={`department-color-${d.id}`}>Section color</label>
                          <input id={`department-color-${d.id}`} name="color" type="color" defaultValue={d.color} />
                          <Button
                            size="lg"
                            stretch="auto"
                            variant="secondary"
                            label={`Save ${d.name}`}
                            type="submit"
                            disabled={busy}
                          />
                        </form>
                      ))}
                    </section>
                  </div>
                ) : admin ? (
                  <AdminPanel office={office} admin={admin} query={query} setQuery={setQuery} act={act} busy={busy} />
                ) : (
                  <p>Loading office management…</p>
                )}
                {admin && (
                  <details className="vo-card vo-audit">
                    <summary>Recent audit records ({admin.audit.length})</summary>
                    {admin.audit.map((entry) => (
                      <pre key={entry.id}>
                        {new Date(entry.created_at).toLocaleString()} · {entry.action}
                        {"\n"}
                        {JSON.stringify(entry.details)}
                      </pre>
                    ))}
                  </details>
                )}
              </>
            )
          ) : (
            <div className="vo-layout">
              <section className="vo-card">
                <div className="vo-card-head">
                  <span>THE OFFICE FLOOR</span>
                  <div className="vo-legend">
                    <span>
                      <i className="online" />
                      Online
                    </span>
                    <span>
                      <i className="mine" />
                      Your desk
                    </span>
                    <button onClick={() => setView(view === "scene" ? "list" : "scene")}>
                      {view === "scene" ? "List view" : "3D view"}
                    </button>
                  </div>
                </div>
                {view === "scene" ? (
                  <OfficeScene office={office} selectedId={selectedId} onSelect={(desk) => setSelectedId(desk.id)} />
                ) : (
                  <div className="vo-table-wrap">
                    <table className="vo-table">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th>Desk</th>
                          <th>Reserved by</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {office.desks.map((desk) => (
                          <tr key={desk.id}>
                            <td>{office.departments.find((d) => d.id === desk.department_id)?.name}</td>
                            <td>{desk.number}</td>
                            <td>{office.members.find((m) => m.id === desk.member_id)?.name ?? "Available"}</td>
                            <td>
                              <button onClick={() => setSelectedId(desk.id)}>Select desk</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="vo-roster">
                  {office.departments.map((d) => (
                    <span key={d.id}>
                      <i className="vo-dot" style={{ background: d.color }} />
                      {d.name} · {office.desks.filter((desk) => desk.department_id === d.id).length}
                    </span>
                  ))}
                </div>
              </section>
              <aside className="vo-side">
                <section className="vo-card vo-panel">
                  <span className="vo-eyebrow">Your workspace</span>
                  <h3>{office.me.name}</h3>
                  <p className="vo-muted">{office.me.position || "Office administrator"}</p>
                  <div className="vo-stat">
                    <span>Department</span>
                    <strong>{department?.name ?? "Unassigned"}</strong>
                  </div>
                  <div className="vo-stat">
                    <span>Your desk</span>
                    <strong>{myDesk ? `Desk ${myDesk.number}` : "Choose a desk"}</strong>
                  </div>
                  <div className="vo-stat">
                    <span>Status</span>
                    <strong>{office.me.online ? "Timed in" : "Timed out"}</strong>
                  </div>
                  <p className="vo-info">
                    Your desk stays yours when you time out. Choose any available desk in your department to settle in.
                  </p>
                </section>
                <section className="vo-card vo-panel">
                  <h2>
                    {selected
                      ? `${office.departments.find((d) => d.id === selected.department_id)?.name} · Desk ${selected.number}`
                      : "Find your spot"}
                  </h2>
                  <p className="vo-info">
                    {selected
                      ? occupant
                        ? `Reserved by ${occupant.name}${occupant.online ? " · In the office" : " · Away"}`
                        : "This desk is available."
                      : "Select a workstation on the floor to see its details. You can also use the list view."}
                  </p>
                  {selected && !selected.member_id && selected.department_id === office.me.department_id && (
                    <Button
                      size="lg"
                      stretch="auto"
                      variant="primary"
                      label="Choose this desk"
                      disabled={busy}
                      onClick={() => void act({ action: "reserve", desk_id: selected.id })}
                    />
                  )}
                  {isAdmin && selected && (
                    <>
                      <label htmlFor="desk-employee" className="vo-muted">
                        Assign to employee
                      </label>
                      <select
                        id="desk-employee"
                        className="vo-department-select"
                        value={assignMember}
                        onChange={(event) => setAssignMember(event.target.value)}
                      >
                        <option value="">Choose employee</option>
                        {office.members
                          .filter((m) => m.department_id === selected.department_id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                      <div className="vo-actions">
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
                            label="Release desk"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void act({ action: "release", desk_id: selected.id })}
                          />
                        )}
                      </div>
                    </>
                  )}
                </section>
                <section className="vo-card vo-panel">
                  <h2>Here today</h2>
                  {office.members
                    .filter((m) => m.online)
                    .map((m) => (
                      <div key={m.id} className="vo-stat">
                        <span>
                          <i className="vo-dot online" />
                          {m.name}
                        </span>
                        <span className="vo-muted">{m.position}</span>
                      </div>
                    ))}
                  {!office.members.some((m) => m.online) && (
                    <p className="vo-info">Be the first to bring the office to life.</p>
                  )}
                </section>
              </aside>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function AdminPanel({
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
        <select id="office-user" required value={userId} onChange={(event) => setUserId(event.target.value)}>
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
                  <td>{member.name}</td>
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

export default function VirtualOfficeRoot() {
  return (
    <AuthenticationWrapper>
      <OfficeContent />
    </AuthenticationWrapper>
  );
}
