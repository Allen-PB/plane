/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import type { IInstanceConfiguration, TInstanceFeatureConfigurationKeys } from "@plane/types";
// hooks
import { useInstance } from "@/hooks/store";

type TFeatureFlag = {
  key: TInstanceFeatureConfigurationKeys;
  Icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURE_FLAGS: { section: string; flags: TFeatureFlag[] }[] = [
  {
    section: "Work items",
    flags: [
      {
        key: "ENABLE_STRUCTURED_UPDATES",
        Icon: ClipboardCheck,
        title: "Structured updates (Dev / QA / BA)",
        description:
          "Role-based updates, their filters and the summary bar on work items. When off, they are hidden in every project and the API rejects them. Project settings and existing updates are kept. Each project still turns the feature on in its own settings.",
      },
    ],
  },
];

type Props = { configurations: IInstanceConfiguration[] };

export const FeatureFlagsForm = observer(function FeatureFlagsForm({ configurations }: Props) {
  const { updateInstanceConfigurations } = useInstance();
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (flag: TFeatureFlag, on: boolean) => {
    setSaving(flag.key);
    try {
      await updateInstanceConfigurations({ [flag.key]: on ? "1" : "0" });
      setToast({ type: "success", title: "Success", message: `${flag.title} turned ${on ? "on" : "off"}.` });
    } catch {
      setToast({ type: "error", title: "Error", message: "Could not update the feature flag. Please try again." });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-8">
      {FEATURE_FLAGS.map(({ section, flags }) => (
        <div key={section} className="space-y-6">
          <div className="border-b border-subtle pb-1.5 text-16 font-medium text-primary">{section}</div>
          {flags.map((flag) => {
            const config = configurations.find((item) => item.key === flag.key);
            // Registered by `configure_instance` when the API starts; until then it can't be saved.
            const registered = !!config;
            const on = (config?.value ?? "1").trim() === "1";
            return (
              <div key={flag.key} className="flex items-center gap-14">
                <div className="flex grow items-center gap-4">
                  <div className="shrink-0">
                    <div className="flex size-11 items-center justify-center rounded-lg bg-layer-1">
                      <flag.Icon className="size-5 text-tertiary" />
                    </div>
                  </div>
                  <div className="grow">
                    <div className="text-13 leading-5 font-medium text-primary">{flag.title}</div>
                    <div className="text-11 leading-5 font-regular text-tertiary">{flag.description}</div>
                    {!registered && (
                      <div className="text-11 leading-5 font-regular text-tertiary">
                        This flag can be changed after the API restarts.
                      </div>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 ${saving === flag.key ? "opacity-70" : ""}`}>
                  <Switch
                    aria-label={flag.title}
                    checked={on}
                    onCheckedChange={(checked) => void toggle(flag, checked)}
                    size="sm"
                    disabled={!registered || saving === flag.key}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});
