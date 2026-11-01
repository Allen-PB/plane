import { useState } from "react";
import { isAxiosError } from "axios";
import { Button } from "@makeplane/propel/components/button";
import type { OfficeWorkState, ScheduleRequest, WorkingDay } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
// oxlint-disable-next-line import/no-unassigned-import
import "./work-schedule.css";

export const workingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function officeError(
  error: unknown,
  fallback = "Could not save. Check the working hours and try again."
): string {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string")
      return data.detail;
    if (Array.isArray(data)) return data.map(String).join(" ");
  }
  return fallback;
}

export function ScheduleFields({
  value,
  onChange,
  disabled = false,
  prefix,
}: {
  value: WorkingDay[];
  onChange: (value: WorkingDay[]) => void;
  disabled?: boolean;
  prefix: string;
}) {
  function update(day: number, fields: Partial<WorkingDay>) {
    onChange(value.map((entry) => (entry.day === day ? { ...entry, ...fields } : entry)));
  }
  return (
    <fieldset disabled={disabled} className="vo-schedule-fields">
      <legend>Working days and hours · Asia/Manila</legend>
      <p>Choose each working day. Use Ends next day for overnight shifts. Overlapping shifts are not allowed.</p>
      {workingDays.map((name, day) => {
        const entry = value.find((item) => item.day === day);
        return (
          <div key={name} className="vo-schedule-day">
            <label htmlFor={`${prefix}-${day}-selected`}>
              <input
                id={`${prefix}-${day}-selected`}
                type="checkbox"
                checked={!!entry}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, { day, start: "", end: "", ends_next_day: false }]
                      : value.filter((item) => item.day !== day)
                  )
                }
              />
              {name}
            </label>
            {entry && (
              <div className="vo-schedule-times">
                <label htmlFor={`${prefix}-${day}-start`}>{name} start time</label>
                <input
                  id={`${prefix}-${day}-start`}
                  type="time"
                  required
                  value={entry.start}
                  onChange={(event) => update(day, { start: event.target.value })}
                />
                <label htmlFor={`${prefix}-${day}-end`}>{name} end time</label>
                <input
                  id={`${prefix}-${day}-end`}
                  type="time"
                  required
                  value={entry.end}
                  onChange={(event) => update(day, { end: event.target.value })}
                />
                <label htmlFor={`${prefix}-${day}-overnight`}>
                  <input
                    id={`${prefix}-${day}-overnight`}
                    type="checkbox"
                    checked={entry.ends_next_day}
                    onChange={(event) => update(day, { ends_next_day: event.target.checked })}
                  />
                  {name} ends next day
                </label>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

export function ScheduleSummary({ schedule }: { schedule: WorkingDay[] }) {
  return (
    <ul>
      {schedule.map((entry) => (
        <li key={entry.day}>
          {workingDays[entry.day]}: {entry.start}–{entry.end}
          {entry.ends_next_day ? " (ends next day)" : ""}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleRequestReview({
  request,
  refresh,
}: {
  request: ScheduleRequest;
  refresh: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(decision: "approved" | "rejected") {
    if (decision === "rejected" && !reason.trim()) {
      setMessage("A rejection reason is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await service.decideSchedule(request.id, request.revision, decision, reason);
      await refresh();
      setMessage(`Request ${decision}.`);
    } catch (error) {
      setMessage(officeError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="vo-schedule-review" aria-label="Pending schedule request">
      <h3>Pending schedule request · revision {request.revision}</h3>
      <ScheduleSummary schedule={request.schedule} />
      <label htmlFor={`request-reason-${request.id}`}>Rejection reason</label>
      <textarea
        id={`request-reason-${request.id}`}
        maxLength={500}
        value={reason}
        disabled={busy}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="vo-actions">
        <Button
          type="button"
          size="sm"
          stretch="auto"
          variant="primary"
          label="Approve schedule"
          disabled={busy}
          onClick={() => void decide("approved")}
        />
        <Button
          type="button"
          size="sm"
          stretch="auto"
          variant="secondary"
          label="Reject schedule"
          disabled={busy}
          onClick={() => void decide("rejected")}
        />
      </div>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>Request revisions</summary>
        {request.revisions.map((revision) => (
          <div key={revision.revision}>
            <strong>Revision {revision.revision}</strong>
            <ScheduleSummary schedule={revision.schedule} />
          </div>
        ))}
      </details>
    </section>
  );
}

function EmployeeScheduleForm({ work, refresh }: { work: OfficeWorkState; refresh: () => Promise<unknown> }) {
  const pending = work.requests.find((request) => request.status === "pending");
  const [schedule, setSchedule] = useState<WorkingDay[]>(pending?.schedule ?? work.schedule);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        void service
          .requestSchedule(schedule, pending?.revision ?? 0)
          .then(async () => {
            await refresh();
            setMessage("Schedule request submitted. Your approved hours remain active until approval.");
            return undefined;
          })
          .catch((error: unknown) => setMessage(officeError(error)))
          .finally(() => setBusy(false));
      }}
    >
      <ScheduleFields prefix="profile-schedule" value={schedule} onChange={setSchedule} disabled={busy} />
      <Button
        size="sm"
        stretch="auto"
        variant="primary"
        type="submit"
        disabled={busy || schedule.length === 0}
        label={pending ? "Update pending request" : "Submit schedule request"}
      />
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function ProfileWorkSchedule({
  work,
  refresh,
}: {
  work: OfficeWorkState | null | undefined;
  refresh: () => Promise<unknown>;
}) {
  if (!work) return null;
  const pending = work.requests.find((request) => request.status === "pending");
  return (
    <section className="mt-6 flex flex-col gap-3" aria-label="Working hours">
      <h2>Working hours</h2>
      <p>
        Attendance arrangement:{" "}
        <strong>
          {work.arrangement === "scheduled"
            ? "Scheduled shift"
            : work.arrangement === "output_based"
              ? "Output-based"
              : "Arrangement not configured"}
        </strong>
      </p>
      {work.arrangement === "scheduled" ? (
        <>
          <h3>Approved schedule · Asia/Manila</h3>
          <ScheduleSummary schedule={work.schedule} />
          <p>
            Request changes below. An Admin or Super Admin must approve them. Open sessions retain their original
            schedule.
          </p>
          <EmployeeScheduleForm key={`${work.policy_id}-${pending?.revision ?? 0}`} work={work} refresh={refresh} />
          {work.requests.map((request) => (
            <details key={request.id}>
              <summary>
                Request {request.id} · {request.status} · revision {request.revision}
              </summary>
              {request.reason && <p>Reason: {request.reason}</p>}
              <ScheduleSummary schedule={request.schedule} />
              {request.revisions.map((revision) => (
                <div key={revision.revision}>
                  Revision {revision.revision}
                  <ScheduleSummary schedule={revision.schedule} />
                </div>
              ))}
            </details>
          ))}
        </>
      ) : (
        <p>
          {work.arrangement === "output_based"
            ? "Time In, Time Out and duration are recorded without schedule-based classifications."
            : "An office administrator must assign your attendance arrangement. Attendance recording remains available for existing members."}
        </p>
      )}
    </section>
  );
}
