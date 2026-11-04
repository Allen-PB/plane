import { useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { virtualOfficeService } from "../../services/virtual-office.service";

type Preset = "today" | "week" | "month" | "last-month" | "custom" | "all";
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function presenceDateRange(preset: Preset, now = new Date()): { start: string; end: string } {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = new Date(`${today}T00:00:00Z`);
  let start = today;
  let end = today;
  if (preset === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    start = iso(date);
  } else if (preset === "month") {
    date.setUTCDate(1);
    start = iso(date);
  } else if (preset === "last-month") {
    date.setUTCDate(0);
    end = iso(date);
    date.setUTCDate(1);
    start = iso(date);
  }
  return { start, end };
}

export function PresenceExport({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presenceDateRange("month"));
  const invalid = preset !== "all" && (!range.start || !range.end || range.start > range.end);
  return (
    <div style={{ marginBottom: 20 }}>
      <section id="presence-export" className="vo-card vo-panel vo-form vo-export-panel" aria-label="Export attendance">
        <h2>Export Time In/Out</h2>
        <p>Choose the event dates to export. Dates include the full day in Asia/Manila (UTC+08:00).</p>
        <div className="vo-export-fields">
          <div>
            <label htmlFor="presence-period">Date range</label>
            <select
              id="presence-period"
              value={preset}
              onChange={(event) => {
                const value = event.target.value as Preset;
                setPreset(value);
                if (value !== "custom" && value !== "all") setRange(presenceDateRange(value));
              }}
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="last-month">Last month</option>
              <option value="custom">Custom range</option>
              <option value="all">All time</option>
            </select>
          </div>
          {preset !== "all" ? (
            <>
              <div>
                <label htmlFor="presence-start">Start date</label>
                <input
                  id="presence-start"
                  type="date"
                  required
                  value={range.start}
                  disabled={preset !== "custom"}
                  onChange={(event) => setRange({ ...range, start: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor="presence-end">End date</label>
                <input
                  id="presence-end"
                  type="date"
                  required
                  value={range.end}
                  disabled={preset !== "custom"}
                  onChange={(event) => setRange({ ...range, end: event.target.value })}
                />
              </div>
            </>
          ) : null}
        </div>
        {invalid && <p role="alert">Choose both dates, with the end date on or after the start date.</p>}
        {preset === "all" && <p>All time exports the complete attendance history.</p>}
        <p>Each row is a Time In or Time Out event. Empty ranges download a CSV with column headers only.</p>
        <div className="vo-actions">
          <Button label="Cancel" size="lg" stretch="auto" variant="secondary" onClick={onClose} />
          {!invalid && (
            <a href={virtualOfficeService.presenceRecordsUrl(preset === "all" ? undefined : range)} download>
              Download CSV
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
