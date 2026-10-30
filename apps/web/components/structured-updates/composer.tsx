/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { isAxiosError } from "axios";
import { observer } from "mobx-react";
import { Button } from "@makeplane/propel/components/button";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { setToast } from "@plane/blocks/toast";
import { WorkflowSelect, workflowError } from "@/components/workflows/fields";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TFunctionalRole, TStructuredUpdatePayload } from "@/services/structured-update.service";
import { structuredUpdateService as service } from "@/services/structured-update.service";
import {
  BA_RESULT_OPTIONS,
  FIELD_LABELS,
  QA_RESULT_OPTIONS,
  ROLE_LABELS,
  ROOT_CAUSE_OPTIONS,
  VALIDATION_LABEL,
  isHttpUrl,
} from "./constants";
import type { TLinkDraft } from "./fields";
import { EvidenceFileField, LinkListField, NoteField, TextField } from "./fields";
import { useIssueStructuredUpdates } from "./use-structured-updates";

type TDraft = {
  result: string;
  root_cause_category: string;
  root_cause: string;
  resolution: string;
  validation: string;
  pr_link: string;
  testmo_ref: string;
  links: TLinkDraft[];
  files: File[];
};

const emptyDraft = (): TDraft => ({
  result: "",
  root_cause_category: "",
  root_cause: "",
  resolution: "",
  validation: "",
  pr_link: "",
  testmo_ref: "",
  links: [],
  files: [],
});

const REQUIRED: Record<TFunctionalRole, (keyof TDraft)[]> = {
  dev: ["root_cause_category", "root_cause", "resolution"],
  qa: ["result", "validation"],
  ba: ["result", "validation"],
};

/** Client-side mirror of the API rules; the server re-validates everything. */
export const validateDraft = (role: TFunctionalRole, draft: TDraft) => {
  const errors: Record<string, string> = {};
  for (const field of REQUIRED[role]) {
    if (!String(draft[field]).trim()) errors[field] = "Required";
  }
  if (role === "dev" && draft.pr_link.trim() && !isHttpUrl(draft.pr_link))
    errors.pr_link = "Only http and https links are allowed.";
  if (draft.links.some((l) => l.url.trim() && !isHttpUrl(l.url))) errors.links = "Fix the evidence links.";
  return errors;
};

const toPayload = (role: TFunctionalRole, draft: TDraft, override: boolean): TStructuredUpdatePayload => {
  const links = draft.links.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), title: l.title.trim() }));
  const base = { role, links, override_state_gate: override, validation: draft.validation };
  if (role === "dev")
    return {
      role,
      links,
      root_cause_category: draft.root_cause_category,
      root_cause: draft.root_cause,
      resolution: draft.resolution,
      pr_link: draft.pr_link,
      override_state_gate: override,
    };
  if (role === "qa") return { ...base, result: draft.result, testmo_ref: draft.testmo_ref };
  return { ...base, result: draft.result };
};

type Props = { workspaceSlug: string; projectId: string; issueId: string; disabled?: boolean };

export const StructuredUpdateComposer = observer(function StructuredUpdateComposer(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { setting, enabled, mutate } = useIssueStructuredUpdates(workspaceSlug, projectId, issueId);
  const { fetchIssue, fetchActivities } = useIssueDetail();
  const [role, setRole] = useState<TFunctionalRole | null>(null);
  const [draft, setDraft] = useState<TDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  const myRoles = setting?.my_roles ?? [];
  if (!enabled || disabled || myRoles.length === 0) return null;
  const activeRole = role && myRoles.includes(role) ? role : null;
  const set = <K extends keyof TDraft>(key: K, value: TDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const close = () => {
    setRole(null);
    setDraft(emptyDraft());
    setErrors({});
    setGateError("");
    setOverride(false);
  };

  const submit = async () => {
    if (!activeRole) return;
    const found = validateDraft(activeRole, draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setGateError("");
    try {
      const created = await service.create(workspaceSlug, projectId, issueId, toPayload(activeRole, draft, override));
      const failedUploads: string[] = [];
      for (const file of draft.files) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- upload large files one at a time
          await service.uploadEvidence(workspaceSlug, projectId, issueId, created.id, file);
        } catch {
          failedUploads.push(file.name);
        }
      }
      await mutate();
      void fetchIssue(workspaceSlug, projectId, issueId);
      void fetchActivities(workspaceSlug, projectId, issueId, "mutate");
      setToast({
        type: created.warning || failedUploads.length ? "warning" : "success",
        title: `${ROLE_LABELS[activeRole]} update posted`,
        message: [
          created.warning,
          failedUploads.length ? `Could not upload: ${failedUploads.join(", ")}. Add them from the update.` : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      close();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setGateError(String(error.response.data?.error ?? "This work item is not in the right state."));
      } else {
        setToast({ type: "error", title: "Could not post update", message: workflowError(error) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-subtle bg-layer-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm-medium text-secondary">Post a structured update:</span>
        {myRoles.map((r) => (
          <Button
            stretch="auto"
            key={r}
            size="sm"
            variant={activeRole === r ? "primary" : "secondary"}
            aria-pressed={activeRole === r}
            label={ROLE_LABELS[r]}
            onClick={() => {
              setRole(activeRole === r ? null : r);
              setErrors({});
              setGateError("");
            }}
          />
        ))}
      </div>

      {activeRole && (
        <form
          className="mt-3 flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {activeRole === "dev" && (
            <>
              <WorkflowSelect
                label={`${FIELD_LABELS.root_cause_category} *`}
                value={draft.root_cause_category}
                options={ROOT_CAUSE_OPTIONS}
                onChange={(v) => set("root_cause_category", v)}
              />
              {errors.root_cause_category && (
                <span className="text-caption-md text-danger-primary">{errors.root_cause_category}</span>
              )}
              <NoteField
                label={FIELD_LABELS.root_cause}
                required
                value={draft.root_cause}
                error={errors.root_cause}
                onChange={(v) => set("root_cause", v)}
              />
              <NoteField
                label={FIELD_LABELS.resolution}
                required
                value={draft.resolution}
                error={errors.resolution}
                onChange={(v) => set("resolution", v)}
              />
              <TextField
                label={FIELD_LABELS.pr_link}
                placeholder="https://"
                value={draft.pr_link}
                error={errors.pr_link}
                onChange={(v) => set("pr_link", v)}
              />
            </>
          )}
          {activeRole !== "dev" && (
            <>
              <WorkflowSelect
                label={`${FIELD_LABELS.result} *`}
                value={draft.result}
                options={activeRole === "qa" ? QA_RESULT_OPTIONS : BA_RESULT_OPTIONS}
                onChange={(v) => set("result", v)}
              />
              {errors.result && <span className="text-caption-md text-danger-primary">{errors.result}</span>}
              <NoteField
                label={VALIDATION_LABEL[activeRole]}
                required
                value={draft.validation}
                error={errors.validation}
                onChange={(v) => set("validation", v)}
              />
              {activeRole === "qa" && (
                <TextField
                  label={FIELD_LABELS.testmo_ref}
                  value={draft.testmo_ref}
                  onChange={(v) => set("testmo_ref", v)}
                />
              )}
            </>
          )}
          <LinkListField links={draft.links} onChange={(v) => set("links", v)} />
          <EvidenceFileField
            files={draft.files}
            onChange={(v) => set("files", v)}
            onError={(message) => setToast({ type: "error", title: "File not added", message })}
          />
          {gateError && (
            <div role="alert" className="text-body-sm flex flex-col gap-2 rounded-md bg-layer-2 p-2">
              <span className="text-danger-primary">{gateError}</span>
              {setting?.is_project_admin && (
                <Checkbox
                  label="Override the state check (project admin)"
                  checked={override}
                  onCheckedChange={(checked) => setOverride(checked)}
                />
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button stretch="auto" variant="secondary" size="md" onClick={close} disabled={busy} label="Cancel" />
            <Button
              stretch="auto"
              variant="primary"
              size="md"
              type="submit"
              disabled={busy}
              label={busy ? "Posting..." : `Post ${ROLE_LABELS[activeRole]} update`}
            />
          </div>
        </form>
      )}
    </div>
  );
});
