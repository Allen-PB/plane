import { useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import type { OfficeProfileState } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import { officeTime } from "./office-format";
import { IdentityFields } from "./identity-fields";
import { ProfileWorkSchedule } from "./work-schedule";
// oxlint-disable-next-line import/no-unassigned-import
import "./office-notices.css";
// oxlint-disable-next-line import/no-unassigned-import
import "./profile-office.css";

export function OfficeNotices() {
  const { data, mutate } = useSWR("office-profile", () => service.profile(), { refreshInterval: 15000 });
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState<number | null>(null);
  async function dismiss(id: number) {
    setError("");
    setDismissing(id);
    try {
      await service.readNotice(id);
      await mutate();
    } catch {
      setError("Could not dismiss the notification. Please try again.");
    } finally {
      setDismissing(null);
    }
  }
  if (!data?.notices.length && !error) return null;
  return (
    <section className="vo-notices" aria-label="Office notifications">
      <div className="vo-notices-heading">
        <h2>Your account updates</h2>
        {!!data?.notices.length && <span>{data.notices.length} unread</span>}
      </div>
      <div className="vo-notices-list" tabIndex={0} role="region" aria-label="Unread office updates">
        {data?.notices.map((notice) => (
          <div className="vo-notice" role="status" key={notice.id}>
            <div className="vo-notice-copy">
              <p className="vo-notice-message">{notice.message}</p>
              <time dateTime={notice.created_at}>{officeTime(notice.created_at)} (Asia/Manila)</time>
            </div>
            <div className="vo-notice-actions">
              {notice.href && <a href={notice.href}>Review details</a>}
              <Button
                type="button"
                size="sm"
                stretch="auto"
                variant="secondary"
                aria-label="Dismiss notification"
                label={dismissing === notice.id ? "Dismissing…" : "Dismiss"}
                disabled={dismissing !== null}
                onClick={() => void dismiss(notice.id)}
              />
            </div>
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function IdentityForm({ profile, refresh }: { profile: OfficeProfileState; refresh: () => Promise<unknown> }) {
  const [departmentId, setDepartmentId] = useState(String(profile.department_id ?? ""));
  const [jobRoleId, setJobRoleId] = useState(String(profile.job_role_id ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await service.saveProfile({ department_id: Number(departmentId), job_role_id: Number(jobRoleId) });
      await refresh();
      setMessage("Department and job role saved.");
    } catch (error) {
      setMessage(
        isAxiosError(error) && typeof error.response?.data?.detail === "string"
          ? error.response.data.detail
          : "Could not save your department and job role. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      <IdentityFields
        prefix="profile-office"
        departments={profile.departments}
        jobRoles={profile.job_roles}
        departmentId={departmentId}
        jobRoleId={jobRoleId}
        disabled={busy || profile.locked}
        onChange={(department, role) => {
          setDepartmentId(department);
          setJobRoleId(role);
        }}
      />
      {profile.locked ? (
        <p>An office administrator manages your department and job role.</p>
      ) : (
        <Button
          size="sm"
          variant="primary"
          stretch="auto"
          type="submit"
          label="Save department and job role"
          disabled={busy || !departmentId || !jobRoleId}
        />
      )}
      {profile.pending && <p role="status">Your new department and job role take effect at your next Time In.</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function ProfileOfficeIdentity() {
  const { data, error, mutate } = useSWR("office-profile", () => service.profile());
  return (
    <section className="profile-office-settings mt-8 flex flex-col gap-3" aria-label="Employee profile">
      <h2>Department and job role</h2>
      <p>Your job role describes your position. It does not grant administrator permissions.</p>
      {error ? (
        <p role="alert">
          Could not load your employee profile.{" "}
          <button type="button" onClick={() => void mutate()}>
            Retry
          </button>
        </p>
      ) : data ? (
        <IdentityForm
          key={`${data.department_id}-${data.job_role_id}-${data.locked}`}
          profile={data}
          refresh={mutate}
        />
      ) : (
        <p>Loading employee profile…</p>
      )}
      <OfficeNotices />
      <ProfileWorkSchedule work={data?.work} refresh={mutate} />
    </section>
  );
}
