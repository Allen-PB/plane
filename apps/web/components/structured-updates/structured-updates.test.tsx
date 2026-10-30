/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TStructuredUpdate, TStructuredUpdateSetting } from "@/services/structured-update.service";
import { StructuredUpdateCard, correctionOptions } from "./card";
import { StructuredUpdateComposer, validateDraft } from "./composer";
import { isHttpUrl } from "./constants";

const state = vi.hoisted(() => ({
  userId: "author",
  setting: undefined as undefined | { is_enabled: boolean; my_roles: string[]; is_project_admin: boolean },
}));

vi.mock("@/hooks/store/user", () => ({ useUser: () => ({ data: { id: state.userId } }) }));
vi.mock("@/hooks/store/use-project-state", () => ({
  useProjectState: () => ({
    getStateById: (id: string) => ({ id, name: id === "s1" ? "In Progress" : "Ready for QA", group: "started" }),
  }),
}));
vi.mock("@/hooks/store/use-issue-detail", () => ({
  useIssueDetail: () => ({ fetchIssue: vi.fn(), fetchActivities: vi.fn() }),
}));
vi.mock("./use-structured-updates", () => ({
  useIssueStructuredUpdates: () => ({
    setting: state.setting,
    enabled: !!state.setting?.is_enabled,
    mutate: vi.fn(),
  }),
}));

const update = (overrides: Partial<TStructuredUpdate> = {}): TStructuredUpdate => ({
  id: "u1",
  issue_id: "i1",
  project_id: "p1",
  role: "dev",
  actor: { id: "author", display_name: "Dana", avatar_url: null },
  result: "",
  root_cause_category: "code",
  root_cause: "<b>bold</b>",
  resolution: "Added a guard",
  validation: "",
  pr_link: "javascript:alert(1)",
  testmo_ref: "",
  from_state_id: "s1",
  to_state_id: "s2",
  qa_round: 0,
  state_gate_overridden: false,
  edited_at: null,
  corrects_id: null,
  correction_reason: "",
  corrected_by_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  links: [],
  evidence: [],
  revision_count: 0,
  ...overrides,
});

const renderCard = (u: TStructuredUpdate, extra: { isLatest?: boolean; corrects?: TStructuredUpdate } = {}) =>
  render(
    <StructuredUpdateCard workspaceSlug="ws" projectId="p1" issueId="i1" update={u} onChanged={vi.fn()} {...extra} />
  );

describe("validateDraft", () => {
  const draft = {
    result: "",
    root_cause_category: "code",
    root_cause: "x",
    resolution: "y",
    validation: "",
    pr_link: "",
    testmo_ref: "",
    links: [],
    files: [],
  };

  it.each(["", "   ", "\n\t"])("rejects blank or spaces-only required fields (%j)", (blank) => {
    expect(validateDraft("dev", { ...draft, root_cause: blank })).toHaveProperty("root_cause");
    expect(validateDraft("qa", { ...draft, result: "passed", validation: blank })).toHaveProperty("validation");
    expect(validateDraft("ba", { ...draft, result: "", validation: "ok" })).toHaveProperty("result");
  });

  it("accepts a complete Dev update", () => {
    expect(validateDraft("dev", draft)).toEqual({});
  });

  it("rejects non-http links", () => {
    expect(validateDraft("dev", { ...draft, pr_link: "javascript:alert(1)" })).toHaveProperty("pr_link");
    expect(
      validateDraft("qa", { ...draft, result: "passed", validation: "ok", links: [{ url: "ftp://x", title: "" }] })
    ).toHaveProperty("links");
  });
});

describe("isHttpUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://localhost:3000/a", true],
    ["javascript:alert(1)", false],
    ["data:text/html,x", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});

describe("StructuredUpdateCard", () => {
  it("shows the role label, field labels and escapes user input", () => {
    const { container } = renderCard(update());
    expect(screen.getByText("Dev")).toBeTruthy();
    expect(screen.getByText("Root cause category")).toBeTruthy();
    expect(screen.getByText("Code")).toBeTruthy();
    expect(screen.getByText("<b>bold</b>")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("State: In Progress → Ready for QA")).toBeTruthy();
  });

  it("never renders a non-http link as a clickable anchor", () => {
    const { container } = renderCard(update());
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("shows QA result, round and the Edited label", () => {
    renderCard(
      update({
        role: "qa",
        result: "failed",
        root_cause_category: "",
        validation: "Broken on Safari",
        qa_round: 2,
        edited_at: new Date().toISOString(),
      })
    );
    expect(screen.getByText("QA")).toBeTruthy();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText("Round 2")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("only offers editing to the author", () => {
    state.userId = "someone-else";
    renderCard(update());
    expect(screen.queryByText("Edit notes")).toBeNull();
    state.userId = "author";
  });
});

describe("StructuredUpdateComposer", () => {
  it("renders nothing when the feature is off", () => {
    state.setting = { is_enabled: false, my_roles: ["dev"], is_project_admin: false };
    const { container } = render(<StructuredUpdateComposer workspaceSlug="ws" projectId="p1" issueId="i1" />);
    expect(container.textContent).toBe("");
  });

  it("only shows tabs for the user's own roles", () => {
    state.setting = { is_enabled: true, my_roles: ["qa"], is_project_admin: false };
    render(<StructuredUpdateComposer workspaceSlug="ws" projectId="p1" issueId="i1" />);
    expect(screen.getByText("QA")).toBeTruthy();
    expect(screen.queryByText("Dev")).toBeNull();
    expect(screen.queryByText("BA")).toBeNull();
  });

  it("renders nothing for members without a functional role", () => {
    state.setting = { is_enabled: true, my_roles: [], is_project_admin: true };
    const { container } = render(<StructuredUpdateComposer workspaceSlug="ws" projectId="p1" issueId="i1" />);
    expect(container.textContent).toBe("");
  });
});

describe("Correcting a result", () => {
  const qaFailed = update({ role: "qa", result: "failed", root_cause_category: "", validation: "Broken", qa_round: 1 });

  it("offers the other result for QA/BA and a different category for Dev", () => {
    expect(correctionOptions(qaFailed).map((o) => o.value)).toEqual(["passed"]);
    expect(correctionOptions(update({ role: "ba", result: "approved" })).map((o) => o.value)).toEqual(["rejected"]);
    expect(correctionOptions(update()).map((o) => o.value)).not.toContain("code");
  });

  it("only offers a correction on the author's latest update", () => {
    const { unmount } = renderCard(qaFailed, { isLatest: true });
    expect(screen.getByText("Correct result")).toBeTruthy();
    unmount();
    renderCard(qaFailed, { isLatest: false });
    expect(screen.queryByText("Correct result")).toBeNull();
  });

  it("does not offer a correction to other members", () => {
    state.userId = "someone-else";
    renderCard(qaFailed, { isLatest: true });
    expect(screen.queryByText("Correct result")).toBeNull();
    state.userId = "author";
  });

  it("labels corrections and corrected updates", () => {
    const correction = update({
      id: "u2",
      role: "qa",
      result: "passed",
      root_cause_category: "",
      corrects_id: qaFailed.id,
      correction_reason: "Picked the wrong result",
    });
    const { unmount } = renderCard(correction, { corrects: qaFailed });
    expect(screen.getByText("Correction")).toBeTruthy();
    expect(screen.getByText(/Failed → Passed/)).toBeTruthy();
    expect(screen.getByText("Picked the wrong result")).toBeTruthy();
    unmount();
    renderCard({ ...qaFailed, corrected_by_id: "u2" });
    expect(screen.getByText("Corrected")).toBeTruthy();
  });
});

describe("isStructuredUpdatesOn", () => {
  it("needs both the instance switch and the project setting", async () => {
    const { isStructuredUpdatesOn } =
      await vi.importActual<typeof import("./use-structured-updates")>("./use-structured-updates");
    const base = { is_enabled: true, instance_enabled: true } as TStructuredUpdateSetting;
    expect(isStructuredUpdatesOn(base)).toBe(true);
    expect(isStructuredUpdatesOn({ ...base, instance_enabled: false })).toBe(false);
    expect(isStructuredUpdatesOn({ ...base, is_enabled: false })).toBe(false);
    expect(isStructuredUpdatesOn(undefined)).toBe(false);
  });
});
