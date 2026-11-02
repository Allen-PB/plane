import { useState } from "react";
import { isAxiosError } from "axios";
import { Button } from "@makeplane/propel/components/button";
import { Radio, RadioGroup } from "@makeplane/propel/components/radio";
import type { OfficeWorkState, ScheduleRequest, WorkingDay } from "../../services/virtual-office.service";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
// oxlint-disable-next-line import/no-unassigned-import
import "./work-schedule.css";

export const workingDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function orderedSchedule(value: WorkingDay[]) {
  return workingDays.flatMap((_, day) => value.filter((entry) => entry.day === day));
}
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

function ScheduleTimes({
  entry,
  name,
  prefix,
  onChange,
}: {
  entry: WorkingDay;
  name: string;
  prefix: string;
  onChange: (fields: Partial<WorkingDay>) => void;
}) {
  return (
    <div className="vo-schedule-times">
      <div className="vo-schedule-time-field">
        <label htmlFor={`${prefix}-start`}>Start time</label>
        <input
          id={`${prefix}-start`}
          aria-label={`${name} start time`}
          type="time"
          required
          value={entry.start}
          onChange={(event) => onChange({ start: event.target.value })}
        />
      </div>
      <div className="vo-schedule-time-field">
        <label htmlFor={`${prefix}-end`}>End time</label>
        <input
          id={`${prefix}-end`}
          aria-label={`${name} end time`}
          type="time"
          required
          value={entry.end}
          onChange={(event) => onChange({ end: event.target.value })}
        />
      </div>
      <label className="vo-schedule-overnight" htmlFor={`${prefix}-overnight`}>
        <input
          id={`${prefix}-overnight`}
          aria-label={`${name} ends next day`}
          type="checkbox"
          checked={entry.ends_next_day}
          onChange={(event) => onChange({ ends_next_day: event.target.checked })}
        />
        Ends next day
      </label>
    </div>
  );
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
  const [mode, setMode] = useState<"same" | "different">("same");
  const first = orderedSchedule(value)[0];
  const uniform = value.every(
    (entry) => entry.start === first?.start && entry.end === first?.end && entry.ends_next_day === first?.ends_next_day
  );
  const same = mode === "same" && uniform;
  function update(day: number, fields: Partial<WorkingDay>) {
    onChange(value.map((entry) => (entry.day === day ? { ...entry, ...fields } : entry)));
  }
  return (
    <fieldset
      disabled={disabled}
      className="vo-schedule-fields"
      aria-labelledby={`${prefix}-heading`}
      aria-describedby={`${prefix}-help`}
    >
      <div className="vo-schedule-heading">
        <h3 id={`${prefix}-heading`}>Working hours</h3>
        <span className="vo-schedule-timezone">Asia/Manila</span>
      </div>
      <p id={`${prefix}-help`} className="vo-schedule-help">
        Select working days, then set their hours. Overnight shifts can end the next day.
      </p>
      <div className="vo-schedule-mode">
        <span className="vo-schedule-mode-title">Schedule setup</span>
        <RadioGroup<"same" | "different">
          density="comfortable"
          aria-label="Schedule setup"
          disabled={disabled}
          value={same ? "same" : "different"}
          onValueChange={(next) => {
            setMode(next);
            if (next === "same" && first)
              onChange(
                value.map((entry) => ({
                  ...entry,
                  start: first.start,
                  end: first.end,
                  ends_next_day: first.ends_next_day,
                }))
              );
          }}
        >
          <label htmlFor={`${prefix}-same`}>
            <Radio id={`${prefix}-same`} value="same" />
            Same hours across days
          </label>
          <label htmlFor={`${prefix}-different`}>
            <Radio id={`${prefix}-different`} value="different" />
            Different hours each day
          </label>
        </RadioGroup>
      </div>
      <p className="vo-schedule-help">Shared hours use the first selected day’s times for every selected day.</p>
      <div className="vo-schedule-days" role="group" aria-label="Working days">
        {workingDays.map((name, day) => {
          const entry = value.find((item) => item.day === day);
          return (
            <label key={name} className="vo-schedule-day-toggle" data-selected={!!entry}>
              <input
                type="checkbox"
                checked={!!entry}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? orderedSchedule([
                          ...value,
                          {
                            day,
                            start: same && first ? first.start : "",
                            end: same && first ? first.end : "",
                            ends_next_day: same && first ? first.ends_next_day : false,
                          },
                        ])
                      : value.filter((item) => item.day !== day)
                  )
                }
              />
              {name}
            </label>
          );
        })}
      </div>
      {same ? (
        first ? (
          <div className="vo-schedule-shared">
            <p className="vo-schedule-help">These hours apply to all selected days.</p>
            <ScheduleTimes
              entry={first}
              name="Shared"
              prefix={`${prefix}-shared`}
              onChange={(fields) => onChange(value.map((entry) => ({ ...entry, ...fields })))}
            />
          </div>
        ) : (
          <p className="vo-schedule-help">Select at least one working day to set shared hours.</p>
        )
      ) : value.length ? (
        orderedSchedule(value).map((entry) => (
          <section key={entry.day} className="vo-schedule-day" aria-label={`${workingDays[entry.day]} hours`}>
            <h4>{workingDays[entry.day]}</h4>
            <ScheduleTimes
              entry={entry}
              name={workingDays[entry.day]}
              prefix={`${prefix}-${entry.day}`}
              onChange={(fields) => update(entry.day, fields)}
            />
          </section>
        ))
      ) : (
        <p className="vo-schedule-help">Select working days to set individual hours.</p>
      )}
      <p className="vo-schedule-help">Shifts must not overlap, including overnight shifts.</p>
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
            Request changes below. An office administrator must approve them. Open sessions retain their original
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
