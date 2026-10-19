/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "./api.service";

export type CSVImportConfig = { mapping: string[]; separator: string; create_labels: boolean };
export type CSVImportError = { line: number; errors: string[] };
export type CSVImportReview = { valid_count: number; errors: CSVImportError[]; missing_labels: string[] };
export type CSVImportJob = {
  id: string;
  project_id: string;
  project_name: string;
  status: "draft" | "queued" | "processing" | "completed" | "failed";
  headers: string[];
  sample: { line: number; values: string[]; error: string }[];
  total: number;
  processed: number;
  succeeded: number;
  errors: CSVImportError[];
  config: CSVImportConfig;
  failure_reason: string;
  review?: CSVImportReview;
};
export type CSVImportMetadata = {
  fields: Record<string, string>;
  labels: { id: string; name: string }[];
  states: { id: string; name: string }[];
};

class CSVImportService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private url(slug: string, id?: string) {
    return `/api/workspaces/${encodeURIComponent(slug)}/csv-imports/${id ? `${id}/` : ""}`;
  }
  async list(slug: string): Promise<{ projects: { id: string; name: string }[]; jobs: CSVImportJob[] }> {
    return (await this.get(this.url(slug))).data;
  }
  async metadata(slug: string, projectId: string): Promise<CSVImportMetadata> {
    return (await this.get(this.url(slug), { params: { project_id: projectId } })).data;
  }
  async upload(slug: string, projectId: string, file: File): Promise<CSVImportJob> {
    const data = new FormData();
    data.append("project_id", projectId);
    data.append("file", file);
    return (await this.post(this.url(slug), data)).data;
  }
  async detail(slug: string, id: string): Promise<CSVImportJob> {
    return (await this.get(this.url(slug, id))).data;
  }
  async action(slug: string, id: string, action: "validate" | "start", config: CSVImportConfig): Promise<CSVImportJob> {
    return (await this.post(this.url(slug, id), { action, ...config })).data;
  }
  async download(slug: string, id: string) {
    const response = await this.get(this.url(slug, id), { params: { download: "errors" } }, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plane-import-errors.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export const csvImportService = new CSVImportService();
