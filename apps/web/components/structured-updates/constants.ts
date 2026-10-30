/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TBAResult,
  TFunctionalRole,
  TQAResult,
  TRootCauseCategory,
  TStructuredUpdateMappingKey,
} from "@/services/structured-update.service";

export const FUNCTIONAL_ROLES: TFunctionalRole[] = ["dev", "qa", "ba"];

export const ROLE_LABELS: Record<TFunctionalRole, string> = { dev: "Dev", qa: "QA", ba: "BA" };

export const ROOT_CAUSE_OPTIONS: { value: TRootCauseCategory; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "requirement_gap", label: "Requirement gap" },
  { value: "data", label: "Data" },
  { value: "config", label: "Config" },
  { value: "environment", label: "Environment" },
  { value: "third_party", label: "Third-party" },
];

export const QA_RESULT_OPTIONS: { value: TQAResult; label: string }[] = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

export const BA_RESULT_OPTIONS: { value: TBAResult; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const RESULT_LABELS: Record<string, string> = Object.fromEntries(
  [...QA_RESULT_OPTIONS, ...BA_RESULT_OPTIONS].map((o) => [o.value, o.label])
);

export const ROOT_CAUSE_LABELS: Record<string, string> = Object.fromEntries(
  ROOT_CAUSE_OPTIONS.map((o) => [o.value, o.label])
);

export const FIELD_LABELS: Record<string, string> = {
  root_cause_category: "Root cause category",
  root_cause: "Root cause",
  resolution: "Resolution",
  pr_link: "PR/commit link",
  result: "Result",
  validation: "Validation",
  testmo_ref: "Testmo case",
};

export const VALIDATION_LABEL: Record<TFunctionalRole, string> = {
  dev: "Validation",
  qa: "QA validation",
  ba: "BA validation",
};

// What each mapping step means, plus the default state name shown when a project has not mapped it.
export const MAPPING_STEPS: { key: TStructuredUpdateMappingKey; label: string; expected: string; gate?: boolean }[] = [
  { key: "ready_for_qa_state", label: "QA results allowed in", expected: "Ready for QA", gate: true },
  { key: "ready_for_ba_state", label: "BA results allowed in", expected: "Ready for BA", gate: true },
  { key: "dev_submit_state", label: "After Dev submits", expected: "Ready for QA" },
  { key: "qa_passed_state", label: "After QA passes", expected: "Ready for BA" },
  { key: "qa_failed_state", label: "After QA fails (QA round +1)", expected: "In Progress" },
  { key: "ba_approved_state", label: "After BA approves", expected: "Done" },
  { key: "ba_rejected_state", label: "After BA rejects", expected: "In Progress" },
];

export const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";
export const EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
export const NOTE_MAX_LENGTH = 10000;

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
