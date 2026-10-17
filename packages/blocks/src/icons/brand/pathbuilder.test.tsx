/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaneLockup } from "./plane-lockup";
import { PlaneLogo } from "./plane-logo";

afterEach(cleanup);

describe("PathBuilder Sync branding after the blocks migration", () => {
  it("renders the lockup with its accessible brand name and full artwork bounds", () => {
    render(<PlaneLockup width={230} height={32} color="white" />);
    const logo = screen.getByRole("img", { name: "PathBuilder Sync" });
    expect(logo.getAttribute("viewBox")).toBe("0 0 460 64");
    expect(logo.getAttribute("width")).toBe("230");
    expect(logo.getAttribute("height")).toBe("32");
    expect(logo.getAttribute("fill")).toBe("white");
    expect(logo.textContent).toContain("PathBuilder Sync");
  });

  it("renders the loading mark with theme-aware color and square artwork bounds", () => {
    render(<PlaneLogo className="text-primary" />);
    const logo = screen.getByRole("img", { name: "PathBuilder Sync" });
    expect(logo.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(logo.getAttribute("fill")).toBe("currentColor");
    expect(logo.getAttribute("class")).toBe("text-primary");
  });
});
