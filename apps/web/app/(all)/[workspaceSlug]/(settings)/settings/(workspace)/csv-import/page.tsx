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
import { CSVImportRoot } from "@/components/csv-import/root";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { useUserPermissions } from "@/hooks/store/user";

export default observer(function CSVImportPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  if (!workspaceUserInfo || !workspaceSlug) return <p role="status">Loading workspace permissions…</p>;
  if (!allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug)) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }
  return (
    <SettingsContentWrapper header={<SettingsPageHeader leftItem={<span>CSV Import</span>} />}>
      <PageHead title="CSV Import" />
      <div className="flex flex-col gap-6">
        <SettingsHeading title="CSV Import" description="Import CSV rows into an existing project." />
        <CSVImportRoot key={workspaceSlug} workspaceSlug={workspaceSlug} />
      </div>
    </SettingsContentWrapper>
  );
});
