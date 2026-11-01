/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import type { TFileSignedURLResponse } from "@plane/types";
import { APIService } from "./api.service";
import { FileUploadService } from "./file-upload.service";

export type TFunctionalRole = "dev" | "qa" | "ba";
export type TRootCauseCategory = "code" | "requirement_gap" | "data" | "config" | "environment" | "third_party";
export type TQAResult = "passed" | "failed";
export type TBAResult = "approved" | "rejected";

export type TStructuredUpdateLink = { id: string; url: string; title: string };
export type TStructuredUpdateEvidence = {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  url: string;
};

export type TStructuredUpdate = {
  id: string;
  issue_id: string;
  project_id: string;
  role: TFunctionalRole;
  actor: { id: string; display_name: string; avatar_url: string | null } | null;
  result: "" | TQAResult | TBAResult;
  root_cause_category: "" | TRootCauseCategory;
  root_cause: string;
  resolution: string;
  validation: string;
  pr_link: string;
  testmo_ref: string;
  from_state_id: string | null;
  to_state_id: string | null;
  qa_round: number;
  state_gate_overridden: boolean;
  edited_at: string | null;
  corrects_id: string | null;
  correction_reason: string;
  corrected_by_id: string | null;
  created_at: string;
  updated_at: string;
  links: TStructuredUpdateLink[];
  evidence: TStructuredUpdateEvidence[];
  revision_count: number;
};

export type TStructuredUpdateCreated = TStructuredUpdate & {
  warning: string | null;
  expected_step: string;
  state_id: string | null;
};

export type TStructuredUpdateCorrectionPayload = {
  result?: TQAResult | TBAResult;
  root_cause_category?: TRootCauseCategory;
  reason: string;
};

export type TIssueStructuredSummary = {
  issue_id: string;
  latest_qa_result: TQAResult | null;
  qa_round_count: number;
  latest_ba_result: TBAResult | null;
  root_cause_category: TRootCauseCategory | null;
};

export type TStructuredUpdateRevision = {
  id: string;
  edited_by: { id: string; display_name: string; avatar_url: string | null } | null;
  changes: Record<string, { old: string; new: string }>;
  created_at: string;
};

export type TStructuredUpdateMappingKey =
  | "ready_for_qa_state"
  | "ready_for_ba_state"
  | "dev_submit_state"
  | "qa_passed_state"
  | "qa_failed_state"
  | "ba_approved_state"
  | "ba_rejected_state";

export type TStructuredUpdateSetting = {
  id: string | null;
  project_id: string;
  is_enabled: boolean;
  enforce_state_gate: boolean;
  suggested_mapping: Record<TStructuredUpdateMappingKey, string | null>;
  my_roles: TFunctionalRole[];
  is_project_admin: boolean;
  /** Instance-wide switch in God Mode > General. When false the feature is off everywhere. */
  instance_enabled: boolean;
} & Record<TStructuredUpdateMappingKey, string | null>;

export type TStructuredUpdatePayload = {
  role: TFunctionalRole;
  result?: string;
  root_cause_category?: string;
  root_cause?: string;
  resolution?: string;
  validation?: string;
  pr_link?: string;
  testmo_ref?: string;
  links?: { url: string; title?: string }[];
  override_state_gate?: boolean;
};

export type TStructuredUpdateEditPayload = Partial<
  Pick<TStructuredUpdate, "root_cause" | "resolution" | "validation" | "pr_link" | "testmo_ref">
>;

export type TFunctionalRoleAssignment = { member_id: string; roles: TFunctionalRole[] };

class StructuredUpdateService extends APIService {
  private fileUploadService = new FileUploadService();

  constructor() {
    super(API_BASE_URL);
  }

  private projectUrl(slug: string, projectId: string) {
    return `/api/workspaces/${encodeURIComponent(slug)}/projects/${projectId}/structured-updates/`;
  }

  private issueUrl(slug: string, projectId: string, issueId: string, updateId?: string) {
    return (
      `/api/workspaces/${encodeURIComponent(slug)}/projects/${projectId}/issues/${issueId}/structured-updates/` +
      (updateId ? `${updateId}/` : "")
    );
  }

  async getSetting(slug: string, projectId: string): Promise<TStructuredUpdateSetting> {
    return (await this.get(this.projectUrl(slug, projectId) + "settings/")).data;
  }

  async updateSetting(
    slug: string,
    projectId: string,
    data: Partial<Pick<TStructuredUpdateSetting, "is_enabled" | "enforce_state_gate" | TStructuredUpdateMappingKey>>
  ): Promise<TStructuredUpdateSetting> {
    return (await this.patch(this.projectUrl(slug, projectId) + "settings/", data)).data;
  }

  async listRoles(slug: string, projectId: string): Promise<TFunctionalRoleAssignment[]> {
    return (await this.get(this.projectUrl(slug, projectId) + "roles/")).data;
  }

  async setRoles(slug: string, projectId: string, data: TFunctionalRoleAssignment): Promise<TFunctionalRoleAssignment> {
    return (await this.put(this.projectUrl(slug, projectId) + "roles/", data)).data;
  }

  async list(
    slug: string,
    projectId: string,
    issueId: string
  ): Promise<{ results: TStructuredUpdate[]; summary: TIssueStructuredSummary | null }> {
    return (await this.get(this.issueUrl(slug, projectId, issueId))).data;
  }

  async create(
    slug: string,
    projectId: string,
    issueId: string,
    data: TStructuredUpdatePayload
  ): Promise<TStructuredUpdateCreated> {
    return (await this.post(this.issueUrl(slug, projectId, issueId), data)).data;
  }

  async edit(
    slug: string,
    projectId: string,
    issueId: string,
    updateId: string,
    data: TStructuredUpdateEditPayload
  ): Promise<TStructuredUpdate> {
    return (await this.patch(this.issueUrl(slug, projectId, issueId, updateId), data)).data;
  }

  async correct(
    slug: string,
    projectId: string,
    issueId: string,
    updateId: string,
    data: TStructuredUpdateCorrectionPayload
  ): Promise<TStructuredUpdateCreated> {
    return (await this.post(this.issueUrl(slug, projectId, issueId, updateId) + "correct/", data)).data;
  }

  async revisions(
    slug: string,
    projectId: string,
    issueId: string,
    updateId: string
  ): Promise<TStructuredUpdateRevision[]> {
    return (await this.get(this.issueUrl(slug, projectId, issueId, updateId) + "revisions/")).data;
  }

  async addLink(
    slug: string,
    projectId: string,
    issueId: string,
    updateId: string,
    data: { url: string; title?: string }
  ): Promise<TStructuredUpdate> {
    return (await this.post(this.issueUrl(slug, projectId, issueId, updateId) + "links/", data)).data;
  }

  async removeLink(slug: string, projectId: string, issueId: string, updateId: string, linkId: string) {
    await this.delete(this.issueUrl(slug, projectId, issueId, updateId) + `links/${linkId}/`);
  }

  async uploadEvidence(
    slug: string,
    projectId: string,
    issueId: string,
    updateId: string,
    file: File
  ): Promise<TStructuredUpdate> {
    const base = this.issueUrl(slug, projectId, issueId, updateId) + "evidence/";
    const meta = await getFileMetaDataForUpload(file);
    const signed: TFileSignedURLResponse = (await this.post(base, meta)).data;
    await this.fileUploadService.uploadFile(signed.upload_data.url, generateFileUploadPayload(signed, file));
    return (await this.patch(`${base}${signed.asset_id}/`, {})).data;
  }

  async removeEvidence(slug: string, projectId: string, issueId: string, updateId: string, assetId: string) {
    await this.delete(this.issueUrl(slug, projectId, issueId, updateId) + `evidence/${assetId}/`);
  }

  evidenceUrl(path: string, inline = false) {
    return `${API_BASE_URL}${path}${inline ? "?inline=true" : ""}`;
  }
}

export const structuredUpdateService = new StructuredUpdateService();
