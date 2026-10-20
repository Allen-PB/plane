import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useLocation } from "react-router";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type { OfficeAction } from "../../services/virtual-office.service";
import { OfficeFloor } from "./floor";
import { AdminPanel } from "./admin-panel";
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [officeName, setOfficeName] = useState("");

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

  const myDesk = office?.desks.find((d) => d.member_id === office.me.id);

  return (
    <div className={`vo-app ${adminPage ? "" : "vo-prototype vo-art-app"}`}>
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
          {adminPage && (
            <div className="vo-intro">
              <div>
                <span className="vo-eyebrow">One team. Endless possibilities.</span>
                <h1>Office management</h1>
                <p className="vo-muted">{office.name} · 39 desks · 7 departments</p>
              </div>
              <div className="vo-actions">
                <span className="vo-pill">{office.members.filter((m) => m.online).length} in the office</span>
                <Button
                  size="lg"
                  stretch="auto"
                  label={office.me.online ? "Time Out" : "Time In"}
                  variant={office.me.online ? "secondary" : "primary"}
                  disabled={busy || (!myDesk && !office.me.online)}
                  onClick={() => void act({ action: office.me.online ? "time_out" : "time_in" })}
                />
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
                <nav className="vo-nav" style={{ marginBottom: 20 }}>
                  <Link to="/virtual-office/admin/access">People & access</Link>
                  <Link to="/virtual-office/admin/settings">Office settings</Link>
                  <a href={service.recordsUrl} download="virtual-office-time-in-out.csv">
                    Download Time In/Out CSV
                  </a>
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
