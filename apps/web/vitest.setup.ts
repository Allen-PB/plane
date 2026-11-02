/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

afterEach(cleanup);

// jsdom omits the Web Animations API used by Base UI's scroll areas.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  // oxlint-disable-next-line no-extend-native
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
}
