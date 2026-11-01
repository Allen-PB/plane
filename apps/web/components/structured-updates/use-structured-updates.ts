/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { TStructuredUpdateSetting } from "@/services/structured-update.service";
import { structuredUpdateService as service } from "@/services/structured-update.service";

export const settingKey = (workspaceSlug: string, projectId: string) =>
  ["structured-update-setting", workspaceSlug, projectId] as const;

export const updatesKey = (workspaceSlug: string, projectId: string, issueId: string) =>
  ["structured-updates", workspaceSlug, projectId, issueId] as const;

/** On only when both the instance switch (God Mode) and the project setting are on. */
export const isStructuredUpdatesOn = (setting?: TStructuredUpdateSetting) =>
  !!setting && setting.instance_enabled !== false && setting.is_enabled;

export function useStructuredUpdateSetting(workspaceSlug?: string, projectId?: string) {
  return useSWR(
    workspaceSlug && projectId ? settingKey(workspaceSlug, projectId) : null,
    // Revalidates on focus so turning the instance switch off reaches open tabs quickly.
    ([, slug, project]) => service.getSetting(slug, project)
  );
}

/** Updates and summary for one work item; only fetched when the project has the feature on. */
export function useIssueStructuredUpdates(workspaceSlug?: string, projectId?: string, issueId?: string) {
  const { data: setting } = useStructuredUpdateSetting(workspaceSlug, projectId);
  const enabled = isStructuredUpdatesOn(setting);
  const updates = useSWR(
    enabled && workspaceSlug && projectId && issueId ? updatesKey(workspaceSlug, projectId, issueId) : null,
    ([, slug, project, issue]) => service.list(slug, project, issue),
    { revalidateOnFocus: false }
  );
  return { setting, enabled, ...updates };
}
