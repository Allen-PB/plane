/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { Switch } from "@makeplane/propel/components/switch";
import { setToast } from "@plane/blocks/toast";
import { SettingsControlItem } from "@/components/settings/control-item";
import { WorkflowSelect, workflowError } from "@/components/workflows/fields";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
import type {
  TFunctionalRole,
  TStructuredUpdateMappingKey,
  TStructuredUpdateSetting,
} from "@/services/structured-update.service";
import { structuredUpdateService as service } from "@/services/structured-update.service";
import { FUNCTIONAL_ROLES, MAPPING_STEPS, ROLE_LABELS } from "./constants";
import { useStructuredUpdateSetting } from "./use-structured-updates";

const NONE = "__none__";

type Props = { workspaceSlug: string; projectId: string };

export const StructuredUpdateSettings = observer(function StructuredUpdateSettings({
  workspaceSlug,
  projectId,
}: Props) {
  const { data: setting, mutate: mutateSetting, error } = useStructuredUpdateSetting(workspaceSlug, projectId);
  const roles = useSWR(["structured-update-roles", workspaceSlug, projectId], () =>
    service.listRoles(workspaceSlug, projectId)
  );
  const { getProjectStates, fetchProjectStates } = useProjectState();
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();
  useSWR(["structured-update-states", workspaceSlug, projectId], () => fetchProjectStates(workspaceSlug, projectId));
  useSWR(["structured-update-members", workspaceSlug, projectId], () => fetchProjectMembers(workspaceSlug, projectId));
  const [saving, setSaving] = useState(false);

  const states = getProjectStates(projectId) ?? [];
  // Guests cannot hold functional roles, so they are not listed.
  const memberIds = getProjectMemberIds(projectId, false) ?? [];
  const rolesByMember = new Map((roles.data ?? []).map((r) => [r.member_id, r.roles]));

  if (error) return <p className="text-body-sm-regular text-danger-primary">{workflowError(error)}</p>;
  if (!setting) return <p role="status">Loading...</p>;
  // God Mode switch off: no controls, only an explanation (the sidebar entry is hidden too).
  if (setting.instance_enabled === false)
    return (
      <p role="status" className="rounded-md bg-layer-2 p-3 text-body-sm-regular text-secondary">
        Structured updates are turned off for this instance in God Mode, so they are hidden in every project. Your
        settings and existing updates are kept and come back when the instance admin turns the feature on again.
      </p>
    );

  const save = async (data: Partial<TStructuredUpdateSetting>) => {
    setSaving(true);
    try {
      const updated = await service.updateSetting(workspaceSlug, projectId, data);
      await mutateSetting({ ...setting, ...updated }, { revalidate: true });
    } catch (e) {
      setToast({ type: "error", title: "Could not save", message: workflowError(e) });
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (memberId: string, role: TFunctionalRole, checked: boolean) => {
    const current = rolesByMember.get(memberId) ?? [];
    const next = checked ? [...new Set([...current, role])] : current.filter((r) => r !== role);
    try {
      await service.setRoles(workspaceSlug, projectId, { member_id: memberId, roles: next });
      await roles.mutate();
      await mutateSetting();
    } catch (e) {
      setToast({ type: "error", title: "Could not update roles", message: workflowError(e) });
    }
  };

  const stateOptions = [
    { value: NONE, label: "Not set" },
    ...states.map((state) => ({ value: state.id, label: state.name })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col divide-y divide-subtle">
        <SettingsControlItem
          title="Enable structured updates"
          description="Lets Dev, QA and BA post structured updates on work items in this project. Off by default."
          control={
            <Switch
              size="sm"
              checked={setting.is_enabled}
              disabled={saving}
              onCheckedChange={(checked) => void save({ is_enabled: checked })}
              aria-label="Enable structured updates"
            />
          }
        />
        <SettingsControlItem
          title="Enforce state checks"
          description="QA results are only accepted in the QA state and BA results in the BA state. Project admins can override."
          control={
            <Switch
              size="sm"
              checked={setting.enforce_state_gate}
              disabled={saving}
              onCheckedChange={(checked) => void save({ enforce_state_gate: checked })}
              aria-label="Enforce state checks"
            />
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-md-medium text-primary">State mapping</h3>
          <p className="text-caption-md-regular text-secondary">
            State names differ between projects. Map each step to one of this project&apos;s states. When a step is not
            set, the result is still saved but the state does not change, and people see which step was expected.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MAPPING_STEPS.map((step) => {
            const value = setting[step.key as TStructuredUpdateMappingKey];
            const hasValue = !!value && states.some((s) => s.id === value);
            return (
              <div key={step.key} className="flex flex-col gap-1">
                <WorkflowSelect
                  label={step.label}
                  value={hasValue ? (value as string) : NONE}
                  options={stateOptions}
                  disabled={saving}
                  onChange={(v) => void save({ [step.key]: v === NONE ? null : v })}
                />
                {!hasValue && (
                  <span className="text-caption-md-regular text-tertiary">
                    Not set. Expected step: {step.expected}
                    {step.gate ? " (the state check is skipped until this is set)." : "."}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-md-medium text-primary">Functional roles</h3>
          <p className="text-caption-md-regular text-secondary">
            People can only post the templates for roles they hold. A member can hold more than one role. Admin and
            Member permissions are not affected.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm-regular">
            <thead>
              <tr className="text-left text-caption-md-medium text-tertiary">
                <th className="py-2 pr-4 font-medium">Member</th>
                {FUNCTIONAL_ROLES.map((role) => (
                  <th key={role} className="px-2 py-2 font-medium">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberIds.map((memberId) => {
                const user = getUserDetails(memberId);
                const held = rolesByMember.get(memberId) ?? [];
                return (
                  <tr key={memberId} className="border-t border-subtle">
                    <td className="py-2 pr-4 text-primary">{user?.display_name ?? memberId}</td>
                    {FUNCTIONAL_ROLES.map((role) => (
                      <td key={role} className="px-2 py-2">
                        <Checkbox
                          aria-label={`${ROLE_LABELS[role]} role for ${user?.display_name ?? "member"}`}
                          checked={held.includes(role)}
                          onCheckedChange={(checked) => void toggleRole(memberId, role, checked)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});
