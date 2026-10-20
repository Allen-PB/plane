import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficeState } from "../../services/virtual-office.service";
import { OfficeScene } from "./scene";

const engine = vi.hoisted(() => ({
  update: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
  select: (_id: number) => {},
  fail: () => {},
}));
vi.mock("./webgl-office", () => ({
  createOfficeRenderer: (_host: HTMLDivElement, select: (id: number) => void, fail: () => void) => {
    engine.select = select;
    engine.fail = fail;
    return engine;
  },
}));
const me = {
  id: "me",
  user_id: "user",
  name: "Alex",
  role: "employee" as const,
  department_id: 1,
  position: "Engineer",
  active: true,
  online: false,
  timed_in_at: null,
};
const office: OfficeState = {
  name: "PathBuilder",
  me,
  members: [me],
  departments: [{ id: 1, order: 0, color: "#4775e7", name: "Development" }],
  desks: [{ id: 1, department_id: 1, number: 1, member_id: "me" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("WebGL2RenderingContext", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("integrated WebGL scene", () => {
  it("selects server desks, preserves server presence, and updates without resetting the camera", async () => {
    const onSelect = vi.fn();
    const { rerender, unmount } = render(<OfficeScene office={office} selectedId={null} onSelect={onSelect} />);
    await screen.findByRole("button", { name: "Reset view" });
    engine.select(1);
    expect(onSelect).toHaveBeenCalledWith(office.desks[0]);
    expect(office.me.online).toBe(false);
    const next = { ...office, members: [{ ...me, online: true }] };
    rerender(<OfficeScene office={next} selectedId={1} onSelect={onSelect} />);
    await waitFor(() => expect(engine.update).toHaveBeenLastCalledWith(next, 1));
    expect(engine.dispose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(engine.reset).toHaveBeenCalledOnce();
    unmount();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
  it("falls back to accessible desks if the graphics context is lost", async () => {
    render(<OfficeScene office={office} selectedId={null} onSelect={vi.fn()} />);
    await screen.findByRole("button", { name: "Reset view" });
    engine.fail();
    expect(await screen.findByRole("button", { name: "Development desk 1, Alex" })).toBeDefined();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});
