import { observer } from "mobx-react";
import { useParams } from "react-router";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BulkUpdateRoot } from "@/components/bulk-update/root";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { useUserPermissions } from "@/hooks/store/user";

export default observer(function BulkUpdatePage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  if (!workspaceUserInfo || !workspaceSlug) return <p role="status">Loading workspace permissions...</p>;
  if (!allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug))
    return <NotAuthorizedView section="settings" className="h-auto" />;
  return (
    <SettingsContentWrapper hugging header={<SettingsPageHeader leftItem={<span>Bulk Update</span>} />}>
      <PageHead title="Bulk Update" />
      <SettingsHeading
        title="Bulk Update"
        description="Update, move, or delete multiple work items in a guided operation."
      />
      <BulkUpdateRoot key={workspaceSlug} workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
});
