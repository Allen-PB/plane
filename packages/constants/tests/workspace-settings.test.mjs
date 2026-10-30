/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_SETTINGS_ACCESS } from "../dist/index.mjs";

test("the shared settings layout allows only admins and owners to open CSV Import", () => {
  // The settings layout resolves this URL to /settings/csv-import before rendering the page.
  const roles = WORKSPACE_SETTINGS_ACCESS["/settings/csv-import"];
  assert.deepEqual(roles, [20]);
  assert.equal(roles.includes(15), false);
  assert.equal(roles.includes(5), false);
});
