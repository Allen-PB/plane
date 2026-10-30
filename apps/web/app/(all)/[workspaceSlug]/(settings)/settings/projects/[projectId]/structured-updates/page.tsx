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
import { StructuredUpdateSettings } from "@/components/structured-updates/settings";
import { useUserPermissions } from "@/hooks/store/user";

export default observer(function StructuredUpdatesSettingsPage() {
  const { workspaceSlug, projectId } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  if (!workspaceUserInfo || !workspaceSlug || !projectId) return <p role="status">Loading permissions...</p>;
  if (!allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId))
    return <NotAuthorizedView section="settings" className="h-auto" />;
  return (
    <SettingsContentWrapper header={<SettingsPageHeader leftItem={<span>Structured updates</span>} />}>
      <PageHead title="Structured updates" />
      <div className="flex flex-col gap-6">
        <SettingsHeading
          title="Structured updates"
          description="Dev, QA and BA post results as data. The results drive state changes and can be used in filters and Views."
        />
        <StructuredUpdateSettings key={workspaceSlug + projectId} workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </SettingsContentWrapper>
  );
});
