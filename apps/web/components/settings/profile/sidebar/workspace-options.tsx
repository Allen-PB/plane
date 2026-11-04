/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { MailOutline, PlusCircleOutline } from "@makeplane/propel/icons";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
import { WorkspaceLogo } from "@/components/workspace/logo";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useInstance } from "@/hooks/store/use-instance";
import { GodModeOnly } from "../god-mode-only";

export const ProfileSettingsSidebarWorkspaceOptions = observer(function ProfileSettingsSidebarWorkspaceOptions() {
  // store hooks
  const { workspaces } = useWorkspace();
  const { config } = useInstance();
  // translation
  const { t } = useTranslation();

  return (
    <div className="shrink-0">
      <div className="p-2 text-caption-md-medium text-tertiary capitalize">{t("common.workspace")}</div>
      <div className="flex flex-col">
        {Object.values(workspaces).map((workspace) => (
          <SettingsSidebarItem
            key={workspace.id}
            as="link"
            href={`/${workspace.slug}/`}
            iconNode={<WorkspaceLogo logo={workspace.logo_url} name={workspace.name} classNames="shrink-0" />}
            label={workspace.name}
            isActive={false}
          />
        ))}
        <GodModeOnly>
          <div className="mt-1.5">
            {!config?.is_workspace_creation_disabled && (
              <SettingsSidebarItem
                as="link"
                href="/create-workspace/"
                icon={PlusCircleOutline}
                label={t("create_workspace")}
                isActive={false}
              />
            )}
            <SettingsSidebarItem
              as="link"
              href="/invitations/"
              icon={MailOutline}
              label={t("workspace_invites")}
              isActive={false}
            />
          </div>
        </GodModeOnly>
      </div>
    </div>
  );
});
