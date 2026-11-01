import { API_BASE_URL } from "@plane/constants";
import { APIService } from "./api.service";

export type BulkProject = { id: string; name: string; identifier: string };
export type BulkWorkItem = {
  id: string;
  name: string;
  key: string;
  state: string;
  priority: string;
  assignees: string[];
  labels: string[];
  start_date: string | null;
  target_date: string | null;
  parent: string;
};
export type BulkMetadata = {
  labels: { id: string; name: string }[];
  cycles: { id: string; name: string }[];
  modules: { id: string; name: string }[];
  states: { id: string; name: string }[];
  members: { id: string; name: string }[];
  parents: { id: string; name: string }[];
};
export type BulkFilters = {
  state_ids: string[];
  priorities: string[];
  assignee_ids: string[];
  label_ids: string[];
  parent_ids: string[];
  start_date_from: string;
  start_date_to: string;
  due_date_from: string;
  due_date_to: string;
};
export type BulkRequest = {
  project_id: string;
  issue_ids: string[];
  operation: "update" | "move" | "archive";
  changes: {
    state_id?: string;
    priority?: string;
    assignee_ids?: string[];
    label_ids?: string[];
    start_date?: string | null;
    target_date?: string | null;
    cycle_id?: string | null;
    module_ids?: string[];
    parent_id?: string | null;
  };
  destinations: Record<string, string>;
};
export type BulkPreview = { token: string; count: number; summary: string[]; items: { key: string; name: string }[] };

export type BulkOutcome = {
  id: string;
  key: string;
  name: string;
  status: "archived" | "skipped" | "failed";
  reason: string;
};

class BulkUpdateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private url(slug: string) {
    return `/api/workspaces/${encodeURIComponent(slug)}/bulk-update/`;
  }
  async projects(slug: string): Promise<BulkProject[]> {
    return (await this.get(this.url(slug))).data.projects;
  }
  async items(
    slug: string,
    projectId: string,
    page: number,
    search: string,
    filters?: BulkFilters
  ): Promise<{ results: BulkWorkItem[]; count: number; metadata: BulkMetadata }> {
    // Lists are sent comma-separated; empty filters are omitted.
    const params: Record<string, string | number> = { project_id: projectId, page, search };
    for (const [key, value] of Object.entries(filters ?? {})) {
      const text = Array.isArray(value) ? value.join(",") : value;
      if (text) params[key] = text;
    }
    return (await this.get(this.url(slug), { params })).data;
  }
  async preview(slug: string, data: BulkRequest): Promise<BulkPreview> {
    return (await this.post(this.url(slug), { ...data, action: "preview" })).data;
  }
  async apply(slug: string, data: BulkRequest, token: string): Promise<{ count: number; results?: BulkOutcome[] }> {
    return (await this.post(this.url(slug), { ...data, action: "apply", token })).data;
  }
}
export const bulkUpdateService = new BulkUpdateService();
