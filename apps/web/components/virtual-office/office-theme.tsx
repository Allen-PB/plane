import { useEffect, useMemo, useState } from "react";
import type { OfficeState, OfficeAppearanceMode } from "../../services/virtual-office.service";

export function resolveOfficeAppearance(mode: OfficeAppearanceMode, now: Date): "day" | "night" {
  if (mode !== "automatic") return mode;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(now)
  );
  return hour >= 18 || hour < 6 ? "night" : "day";
}

export function useOfficeSceneAppearance(office?: Pick<OfficeState, "appearance_mode" | "server_time">) {
  const [now, setNow] = useState(() => Date.now());
  const clock = useMemo(() => {
    const receivedAt = Date.now();
    const serverTime = office?.server_time ? Date.parse(office.server_time) : NaN;
    return { receivedAt, offset: Number.isFinite(serverTime) ? serverTime - receivedAt : 0 };
  }, [office?.server_time]);
  const offset = clock.offset;
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    // Schedule only the next boundary instead of rerendering every desk each second.
    const manila = new Date(Date.now() + offset + 8 * 60 * 60 * 1000);
    const hour = manila.getUTCHours();
    const next = Date.UTC(
      manila.getUTCFullYear(),
      manila.getUTCMonth(),
      manila.getUTCDate(),
      hour < 6 ? 6 : hour < 18 ? 18 : 30
    );
    const timer =
      office?.appearance_mode && office.appearance_mode !== "automatic"
        ? undefined
        : window.setTimeout(refresh, Math.max(1, next - manila.getTime()));
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [now, offset, office?.appearance_mode]);
  return resolveOfficeAppearance(
    office?.appearance_mode ?? "automatic",
    new Date(Math.max(now, clock.receivedAt) + offset)
  );
}

export function OfficeThemeSwitch({
  mode,
  busy,
  onChange,
}: {
  mode: OfficeAppearanceMode;
  busy: boolean;
  onChange: (mode: OfficeAppearanceMode) => void;
}) {
  return (
    <label className="vo-appearance-control">
      <span>Office scene</span>
      <select
        aria-label="Office scene appearance"
        value={mode}
        disabled={busy}
        onChange={(event) => onChange(event.target.value as OfficeAppearanceMode)}
      >
        <option value="automatic">Automatic · Manila time</option>
        <option value="day">Day</option>
        <option value="night">Night</option>
      </select>
    </label>
  );
}
