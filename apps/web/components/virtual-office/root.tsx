import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useLocation } from "react-router";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type { OfficeAction } from "../../services/virtual-office.service";
import { OfficeFloor } from "./floor";
import { AdminPanel } from "./admin-panel";
import { PresenceExport } from "./presence-export";
import { OfficeThemeSwitch } from "./office-theme";
import { JobRoleCatalog } from "./job-role-catalog";
import { OfficeNotices } from "./profile-identity";
import { AttendanceControls } from "./attendance-controls";
import { AttendanceReportPanel } from "./attendance-report";
import { officeTime } from "./office-format";
// CSS is scoped under .vo-app to keep the rest of Sync unchanged.
// oxlint-disable-next-line import/no-unassigned-import
import "./office.css";
// oxlint-disable-next-line import/no-unassigned-import
import "./office-night.css";
// oxlint-disable-next-line import/no-unassigned-import
import "./office-management.css";

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
  const currentPath = useRef(pathname);
  const attendancePage = pathname.includes("/directory/attendance");
  const adminPage = pathname.includes("/admin") || attendancePage;
  const settingsPage = /\/settings\/?$/.test(pathname);
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
    () => service.admin(query),
    { keepPreviousData: true }
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [officeName, setOfficeName] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    currentPath.current = pathname;
    setMessage("");
    setExportOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (message !== "Office updated." && !message.startsWith("Employee access saved for ")) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!status?.allowed || !office?.me.timed_in_at) return;
    const timer = window.setInterval(() => {
      void service
        .action({ action: "heartbeat" })
        .catch((heartbeatError: unknown) => setMessage(errorMessage(heartbeatError)));
    }, 25000);
    return () => window.clearInterval(timer);
  }, [status?.allowed, office?.me.timed_in_at]);

  async function act(action: OfficeAction) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const actionPath = pathname;
    const editedAccount =
      action.action === "member"
        ? (admin?.users.find((user) => user.id === action.user_id)?.email ??
          admin?.members.find((member) => member.user_id === action.user_id)?.name ??
          "the selected account")
        : null;
    try {
      await service.action(action);
      await Promise.all([mutate(), mutateAdmin()]);
      if (currentPath.current === actionPath)
        setMessage(editedAccount ? `Employee access saved for ${editedAccount}.` : "Office updated.");
    } catch (actionError: unknown) {
      if (currentPath.current === actionPath) setMessage(errorMessage(actionError));
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`vo-app ${adminPage ? "vo-management-app" : "vo-prototype vo-art-app"}`}>
      <header className="vo-header">
        <Link to="/virtual-office" className="vo-brand">
          <img className="vo-office-lockup" src="/virtual-office/art-v1/pathbuilder-only.svg" alt="PathBuilder" />
        </Link>
        {!adminPage && status?.allowed && office && !error && (
          <div className="vo-header-stats">
            <span>
              <b>{office.members.filter((m) => m.online).length}</b> Online
            </span>
            <span>
              <b>{office.desks.length - office.members.filter((m) => m.online).length}</b> Offline
            </span>
            <span>
              <b>{office.desks.length}</b> Desks
            </span>
          </div>
        )}
        <nav className="vo-nav" aria-label="Virtual Office">
          {isAdmin && office && (
            <OfficeThemeSwitch
              mode={office.appearance_mode ?? "automatic"}
              busy={busy}
              onChange={(appearance_mode) => void act({ action: "appearance", appearance_mode })}
            />
          )}
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
            Setting up the office for the first time? Your deployment operator must designate the first office
            administrator.
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
          <OfficeNotices />
          {adminPage && (
            <div className="vo-intro">
              <div>
                <span className="vo-eyebrow">Office management</span>
                <h1>{attendancePage ? "Attendance" : settingsPage ? "Office settings" : "People & access"}</h1>
                <p className="vo-muted">
                  {office.name} · {office.desks.length} desks · {office.departments.length} departments
                </p>
              </div>
              <div className="vo-actions">
                <span className="vo-pill">{office.members.filter((m) => m.online).length} in the office</span>
                <AttendanceControls office={office} busy={busy} act={act} compact />
              </div>
            </div>
          )}
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
                <nav className="vo-nav vo-management-sections" aria-label="Office management sections">
                  <Link
                    to="/virtual-office/admin/access"
                    aria-current={!attendancePage && !settingsPage ? "page" : undefined}
                  >
                    People & access
                  </Link>
                  <Link to="/virtual-office/admin/settings" aria-current={settingsPage ? "page" : undefined}>
                    Office settings
                  </Link>
                  <Link to="/virtual-office/directory/attendance" aria-current={attendancePage ? "page" : undefined}>
                    Attendance
                  </Link>
                  <Link to="/virtual-office">Desk assignments ↗</Link>
                  <a
                    href="#presence-export"
                    aria-expanded={exportOpen}
                    aria-controls="presence-export"
                    onClick={(event) => {
                      event.preventDefault();
                      setExportOpen(!exportOpen);
                    }}
                  >
                    Download Time In/Out CSV
                  </a>
                </nav>
                {exportOpen && <PresenceExport onClose={() => setExportOpen(false)} />}
                {attendancePage ? (
                  <AttendanceReportPanel office={office} members={admin?.members} />
                ) : settingsPage ? (
                  <div className="vo-settings-grid">
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
                      <p className="vo-info">Department names are fixed. Manage their colors below.</p>
                      {office.departments.map((d) => (
                        <form
                          key={`${d.id}-${d.name}-${d.color}`}
                          className="vo-form vo-department-color-form"
                          aria-label={`${d.name} color`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            void act({
                              action: "department",
                              department_id: d.id,
                              color: String(form.get("color")),
                            });
                          }}
                        >
                          <strong>{d.name}</strong>
                          <div className="vo-department-color-controls">
                            <div>
                              <label htmlFor={`department-color-${d.id}`}>Section color</label>
                              <input id={`department-color-${d.id}`} name="color" type="color" defaultValue={d.color} />
                            </div>
                            <Button
                              size="lg"
                              stretch="auto"
                              variant="secondary"
                              label="Save color"
                              aria-label={`Save ${d.name} color`}
                              type="submit"
                              disabled={busy}
                            />
                          </div>
                        </form>
                      ))}
                    </section>
                    {office.me.role === "super_admin" && admin && (
                      <JobRoleCatalog
                        departments={office.departments}
                        roles={admin.job_roles ?? []}
                        refresh={mutateAdmin}
                      />
                    )}
                  </div>
                ) : admin ? (
                  <AdminPanel
                    office={office}
                    admin={admin}
                    query={query}
                    setQuery={setQuery}
                    act={act}
                    busy={busy}
                    refresh={() => Promise.all([mutateAdmin(), mutate()])}
                  />
                ) : (
                  <p>Loading office management…</p>
                )}
                {admin && (
                  <details className="vo-card vo-audit">
                    <summary>Recent audit records ({admin.audit.length})</summary>
                    {admin.audit.map((entry) => (
                      <pre key={entry.id}>
                        {officeTime(entry.created_at)} · {entry.action}
                        {"\n"}
                        {JSON.stringify(entry.details)}
                      </pre>
                    ))}
                  </details>
                )}
              </>
            )
          ) : (
            <OfficeFloor office={office} busy={busy} act={act} />
          )}
        </main>
      )}
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
