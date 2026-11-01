import { useId, useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { Dialog, DialogContent, DialogTitle } from "@makeplane/propel/components/dialog";
import type { OfficeAction, OfficeState } from "../../services/virtual-office.service";

export function officeTime(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(value))
    : "—";
}

export function AttendanceControls({
  office,
  busy,
  act,
  compact = false,
}: {
  office: OfficeState;
  busy: boolean;
  act: (action: OfficeAction) => Promise<void>;
  compact?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const choices = office.attendance?.choices ?? [];
  const session = office.attendance?.session;
  const shiftDate =
    choices.length === 0
      ? ""
      : choices.some((choice) => choice.date === selected)
        ? selected
        : selected === "unscheduled"
          ? selected
          : (office.attendance?.suggested_date ?? "");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(office.server_time ?? Date.now()));
  const timedIn = !!office.me.timed_in_at;
  const hasDesk = office.desks.some((desk) => desk.member_id === office.me.id);
  const freeDesk = office.desks.some((desk) => desk.department_id === office.me.department_id && !desk.member_id);
  const blocked =
    busy ||
    !office.me.department_id ||
    office.me.job_role_id === null ||
    !!office.me.identity_pending ||
    (!hasDesk && freeDesk);
  function timeOut() {
    // Confirm every scheduled early exit. The server independently enforces this
    // using its actual clock if the browser clock or cached state is stale.
    if (
      session?.expected_end &&
      new Date(office.server_time ?? Date.now()).getTime() < new Date(session.expected_end).getTime()
    ) {
      setReason("");
      setConfirming(true);
    } else void act({ action: "time_out" });
  }
  return (
    <div className="vo-attendance-controls">
      {!compact && session && (
        <div aria-label="Your attendance" className="vo-info">
          <p>
            {session.in_progress ? "Current session" : "Last session"} ·{" "}
            {session.arrangement === "output_based"
              ? "Output-based"
              : session.legacy
                ? "Legacy"
                : session.arrangement === "scheduled"
                  ? "Scheduled shift"
                  : "Arrangement not configured"}
          </p>
          <p>
            Time In: {officeTime(session.time_in)}
            <br />
            Time Out: {session.in_progress ? "In progress" : officeTime(session.time_out)}
          </p>
          <p>
            {[session.arrival, session.departure].filter(Boolean).join(" · ") || "No schedule classification"}
            {session.needs_review && " · Needs review"}
          </p>
          <p>
            Duration:{" "}
            {session.duration_seconds === null
              ? "Unknown"
              : `${Math.floor(session.duration_seconds / 3600)}h ${Math.floor((session.duration_seconds % 3600) / 60)}m`}
            {session.in_progress && " (in progress)"}
          </p>
          {session.employee_reason && <p>Early departure reason: {session.employee_reason}</p>}
        </div>
      )}
      {!timedIn && choices.length > 0 && (
        <div>
          <label htmlFor={`${id}-shift`}>Shift · Asia/Manila</label>
          <select
            id={`${id}-shift`}
            value={shiftDate}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
          >
            {choices.map((choice) => (
              <option key={choice.date} value={choice.date}>
                {officeTime(choice.expected_start)} → {officeTime(choice.expected_end)}
              </option>
            ))}
            {!choices.some((choice) => choice.date === today) && (
              <option value="unscheduled">Today · non-working day (Needs review)</option>
            )}
          </select>
        </div>
      )}
      <div className="vo-presence-buttons">
        {(!compact || !timedIn) && (
          <Button
            size="lg"
            stretch={compact ? "auto" : "full"}
            variant="primary"
            label="Time In"
            disabled={blocked || timedIn}
            onClick={() =>
              void act({
                action: "time_in",
                ...(shiftDate ? { shift_date: shiftDate === "unscheduled" ? today : shiftDate } : {}),
              })
            }
          />
        )}
        {(!compact || timedIn) && (
          <Button
            size="lg"
            stretch={compact ? "auto" : "full"}
            variant="secondary"
            label="Time Out"
            disabled={busy || !timedIn}
            onClick={timeOut}
          />
        )}
      </div>
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
      >
        <DialogContent size="md">
          <div className="p-6">
            <DialogTitle>Time out before your shift ends?</DialogTitle>
            <p>
              Your scheduled end is {officeTime(session?.expected_end)} · Asia/Manila. Confirming records an early
              departure.
            </p>
            <label htmlFor={`${id}-reason`}>Reason (optional)</label>
            <textarea
              id={`${id}-reason`}
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="vo-actions">
              <Button
                size="lg"
                stretch="auto"
                variant="secondary"
                label="Stay timed in"
                disabled={busy}
                onClick={() => setConfirming(false)}
              />
              <Button
                size="lg"
                stretch="auto"
                variant="primary"
                label="Confirm Time Out"
                disabled={busy}
                onClick={() => {
                  void act({ action: "time_out", confirmed: true, employee_reason: reason }).then(() => {
                    setConfirming(false);
                    return undefined;
                  });
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
