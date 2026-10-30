/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WorkflowRoot } from "@/components/workflows/root";
import { useUserPermissions } from "@/hooks/store/user";

export default observer(function WorkflowPage() {
  const { workspaceSlug, projectId } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  if (!workspaceUserInfo || !workspaceSlug) return <p role="status">Loading permissions...</p>;
  if (
    !allowPermissions(
      [EUserPermissions.ADMIN],
      projectId ? EUserPermissionsLevel.PROJECT : EUserPermissionsLevel.WORKSPACE,
      workspaceSlug,
      projectId
    )
  )
    return <NotAuthorizedView section="settings" className="h-auto" />;
  return (
    <SettingsContentWrapper header={<SettingsPageHeader leftItem={<span>Workflow</span>} />}>
      <PageHead title="Workflow" />
      <div className="flex flex-col gap-6">
        <SettingsHeading
          title="Workflow"
          description={
            projectId
              ? "Set up this project's States, Labels, and Estimates manually or apply a saved workflow."
              : "Create reusable States, Labels, and Estimates for your workspace projects."
          }
        />
        <WorkflowRoot key={workspaceSlug + (projectId ?? "")} workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </SettingsContentWrapper>
  );
});
