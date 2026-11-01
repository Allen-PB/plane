import { useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import type { OfficeProfileState } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import { IdentityFields } from "./identity-fields";
import { ProfileWorkSchedule } from "./work-schedule";

export function OfficeNotices() {
  const { data, mutate } = useSWR("office-profile", () => service.profile(), { refreshInterval: 15000 });
  const [error, setError] = useState("");
  async function dismiss(id: number) {
    try {
      await service.readNotice(id);
      await mutate();
    } catch {
      setError("Could not dismiss the notification. Please try again.");
    }
  }
  return (
    <div aria-label="Office notifications">
      {data?.notices.map((notice) => (
        <div role="status" key={notice.id}>
          <p>{notice.message}</p>
          {notice.href && <a href={notice.href}>Review details</a>}
          <button type="button" onClick={() => void dismiss(notice.id)}>
            Dismiss notification
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
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
    <section className="mt-8 flex flex-col gap-3" aria-label="Employee profile">
      <h2>Department and job Role</h2>
      <p>Your job Role describes your position. It does not grant administrator permissions.</p>
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
