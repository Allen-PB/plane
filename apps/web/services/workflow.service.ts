/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "./api.service";

export type WorkflowState = {
  name: string;
  description: string;
  color: string;
  group: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
  default: boolean;
};
export type WorkflowLabel = { name: string; description: string; color: string };
export type WorkflowConfig = {
  states: WorkflowState[];
  labels: WorkflowLabel[];
  estimates: { name: string; type: "points" | "categories"; values: string[] } | null;
};
export type WorkflowDraft = { name: string; description: string; config: WorkflowConfig };
export type SavedWorkflow = WorkflowDraft & { id: string; updated_at: string };
export type WorkflowPreview = {
  token: string;
  changes: { section: string; name: string; action: string }[];
  estimate_mapping: { id: string; value: string; suggested: string }[];
  conflicts: string[];
};

class WorkflowService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private url(slug: string, id = "") {
    return "/api/workspaces/" + encodeURIComponent(slug) + "/workflows/" + (id ? id + "/" : "");
  }
  private projectUrl(slug: string, projectId: string) {
    return "/api/workspaces/" + encodeURIComponent(slug) + "/projects/" + projectId + "/workflows/";
  }
  async list(slug: string, projectId?: string): Promise<SavedWorkflow[]> {
    return (await this.get(projectId ? this.projectUrl(slug, projectId) : this.url(slug))).data;
  }
  async save(slug: string, draft: WorkflowDraft, id?: string): Promise<SavedWorkflow> {
    return (await (id ? this.patch(this.url(slug, id), draft) : this.post(this.url(slug), draft))).data;
  }
  async remove(slug: string, id: string): Promise<void> {
    await this.delete(this.url(slug, id));
  }
  async preview(slug: string, projectId: string, workflowId: string): Promise<WorkflowPreview> {
    return (await this.post(this.projectUrl(slug, projectId), { action: "preview", workflow_id: workflowId })).data;
  }
  async apply(
    slug: string,
    projectId: string,
    workflowId: string,
    token: string,
    mapping: Record<string, string>
  ): Promise<void> {
    await this.post(this.projectUrl(slug, projectId), { action: "apply", workflow_id: workflowId, token, mapping });
  }
}
export const workflowService = new WorkflowService();
