import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeThemeSwitch, resolveOfficeAppearance, useOfficeSceneAppearance } from "./office-theme";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("shared office scene appearance", () => {
  it.each([
    ["2026-10-21T21:59:59Z", "night"],
    ["2026-10-21T22:00:00Z", "day"],
    ["2026-10-22T09:59:59Z", "day"],
    ["2026-10-22T10:00:00Z", "night"],
    ["2026-10-22T16:00:00Z", "night"],
  ])("uses Manila boundaries at %s", (date, appearance) => {
    expect(resolveOfficeAppearance("automatic", new Date(date))).toBe(appearance);
  });
  it("keeps shared overrides independent of clock and old browser preferences", () => {
    window.localStorage.setItem("pathbuilder.virtual-office.appearance", "night");
    expect(resolveOfficeAppearance("day", new Date("2026-10-22T16:00:00Z"))).toBe("day");
    expect(resolveOfficeAppearance("night", new Date("2026-10-22T00:00:00Z"))).toBe("night");
  });
  it("changes at 6pm without a page reload using server time even if device clock is wrong", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    function Harness() {
      const appearance = useOfficeSceneAppearance({
        appearance_mode: "automatic",
        server_time: "2026-10-22T09:59:59Z",
      });
      return <span>{appearance}</span>;
    }
    render(<Harness />);
    expect(screen.getByText("day")).toBeDefined();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("night")).toBeDefined();
  });
  it("offers shared Automatic/Day/Night options and disables updates during save", () => {
    const change = vi.fn();
    const { rerender } = render(<OfficeThemeSwitch mode="automatic" busy={false} onChange={change} />);
    fireEvent.change(screen.getByLabelText("Office scene appearance"), { target: { value: "night" } });
    expect(change).toHaveBeenCalledWith("night");
    rerender(<OfficeThemeSwitch mode="night" busy={true} onChange={change} />);
    expect((screen.getByLabelText("Office scene appearance") as HTMLSelectElement).disabled).toBe(true);
  });
});
