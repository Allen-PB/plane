import { useId, useRef, useState } from "react";
import { MenuOutline } from "@makeplane/propel/icons";
import { Button } from "@makeplane/propel/components/button";
import { Icon } from "@makeplane/propel/components/icon";
import { GROUPED_PROFILE_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileSettingsTabs } from "@plane/types";
import { ProfileSettingsContent } from "./content";
import { ProfileSettingsSidebarRoot } from "./sidebar";
// oxlint-disable-next-line import/no-unassigned-import
import "./layout.css";

const menuIcon = <Icon icon={MenuOutline} />;

export function ProfileSettingsLayout({
  activeTab,
  updateActiveTab,
}: {
  activeTab: TProfileSettingsTabs;
  updateActiveTab: (tab: TProfileSettingsTabs) => void;
}) {
  const { t } = useTranslation();
  const navigationId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const activeItem = Object.values(GROUPED_PROFILE_SETTINGS)
    .flat()
    .find((item) => item.key === activeTab);
  function closeNavigation() {
    setNavigationOpen(false);
    if (navigationOpen) menuButton.current?.focus();
  }
  return (
    <div className="profile-settings-shell">
      <div className="profile-settings-layout">
        <div className="profile-settings-mobile-header">
          <span>{activeItem ? t(activeItem.i18n_label) : t("profile_settings")}</span>
          <Button
            ref={menuButton}
            type="button"
            variant="secondary"
            size="lg"
            stretch="auto"
            icon={menuIcon}
            label={t("profile_settings")}
            aria-expanded={navigationOpen}
            aria-controls={navigationId}
            onClick={() => setNavigationOpen(!navigationOpen)}
          />
        </div>
        <nav
          id={navigationId}
          className="profile-settings-navigation"
          aria-label={t("profile_settings")}
          data-open={navigationOpen}
          onKeyDown={(event) => {
            if (navigationOpen && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeNavigation();
            }
          }}
        >
          <ProfileSettingsSidebarRoot
            activeTab={activeTab}
            className="size-full"
            updateActiveTab={(tab) => {
              updateActiveTab(tab);
              closeNavigation();
            }}
          />
        </nav>
        <ProfileSettingsContent activeTab={activeTab} className="profile-settings-content" />
      </div>
    </div>
  );
}
