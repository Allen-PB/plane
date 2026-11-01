import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { virtualOfficeService as service } from "../../services/virtual-office.service";
import type { AttendanceReport, AttendanceRow, OfficeMember, OfficeState } from "../../services/virtual-office.service";
import { officeError } from "./work-schedule";
import { officeDate, officeTime } from "./office-format";

export function reportValue(value: AttendanceRow[keyof AttendanceRow]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function AttendanceReportPanel({
  office,
  members = office.members,
}: {
  office: OfficeState;
  members?: OfficeMember[];
}) {
  const today = officeDate(office.server_time ?? Date.now());
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [member, setMember] = useState("");
  const [department, setDepartment] = useState("");
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const data = await service.createAttendanceReport({
        start_date: start,
        end_date: end,
        ...(member ? { member_id: member } : {}),
        ...(department ? { department_id: Number(department) } : {}),
      });
      setReport(data);
      setPage(0);
    } catch (error) {
      setMessage(officeError(error, "Could not generate the report. Check the filters and try again."));
    } finally {
      setBusy(false);
    }
  }
  async function exportPDF() {
    if (!report) return;
    setBusy(true);
    setMessage("");
    try {
      // Recheck current office permission and expiry before preparing a file.
      const checked = await service.attendanceReport(report.id);
      const { downloadAttendancePDF } = await import("./attendance-pdf");
      await downloadAttendancePDF(checked);
    } catch (error) {
      setMessage(officeError(error, "Could not download the PDF. Generate a fresh report and try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="vo-card vo-panel vo-attendance-report" aria-label="Team attendance">
      <h1>Attendance</h1>
      <p>
        All dates and times use Asia/Manila. Overnight shifts belong to their start date. Durations include breaks;
        legacy or incomplete records remain marked for review.
      </p>
      <form
        className="vo-form"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label htmlFor="attendance-start">Start date</label>
        <input
          id="attendance-start"
          type="date"
          required
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <label htmlFor="attendance-end">End date</label>
        <input
          id="attendance-end"
          type="date"
          required
          min={start}
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
        <label htmlFor="attendance-member">Employee</label>
        <select id="attendance-member" value={member} onChange={(event) => setMember(event.target.value)}>
          <option value="">All employees, including historical records</option>
          {members.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {!item.active ? " (Revoked)" : ""}
            </option>
          ))}
        </select>
        <label htmlFor="attendance-department">Department at Time In</label>
        <select id="attendance-department" value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {office.departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button size="lg" stretch="auto" variant="primary" label="Generate report" type="submit" disabled={busy} />
      </form>
      {message && <p role="alert">{message}</p>}
      {report && (
        <>
          <p role="status">
            Frozen report: {report.filters.start_date} → {report.filters.end_date} · {report.rows.length} sessions ·
            Generated {officeTime(report.generated_at)} · Expires {officeTime(report.expires_at)}. Changing filters
            requires Generate report.
          </p>
          <div className="vo-actions">
            <a href={service.attendanceCSV(report.id)}>Download CSV · all {report.rows.length} sessions</a>
            <Button
              size="sm"
              stretch="auto"
              variant="secondary"
              label={`Download PDF · all ${report.rows.length} sessions`}
              disabled={busy}
              onClick={() => void exportPDF()}
            />
          </div>
          {report.rows.length === 0 ? (
            <p>No attendance records match these filters.</p>
          ) : (
            <>
              <div
                className="vo-attendance-table"
                tabIndex={0}
                role="region"
                aria-label="Attendance results, scroll horizontally for all columns"
              >
                <table>
                  <thead>
                    <tr>
                      {report.columns.map(([key, title]) => (
                        <th key={key} scope="col">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(page * 50, (page + 1) * 50).map((row) => (
                      <tr key={row.id}>
                        {report.columns.map(([key]) => (
                          <td key={key}>{reportValue(row[key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="vo-actions">
                <Button
                  size="sm"
                  stretch="auto"
                  variant="secondary"
                  label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                />
                <span>
                  Page {page + 1} of {Math.ceil(report.rows.length / 50)}
                </span>
                <Button
                  size="sm"
                  stretch="auto"
                  variant="secondary"
                  label="Next page"
                  disabled={(page + 1) * 50 >= report.rows.length}
                  onClick={() => setPage(page + 1)}
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
