/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Badge } from "@makeplane/propel/components/badge";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { calculateTimeAgo, renderFormattedDate } from "@plane/utils";
import { WorkflowSelect, workflowError } from "@/components/workflows/fields";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import type {
  TStructuredUpdate,
  TStructuredUpdateCorrectionPayload,
  TStructuredUpdateEditPayload,
  TStructuredUpdateRevision,
} from "@/services/structured-update.service";
import { structuredUpdateService as service } from "@/services/structured-update.service";
import {
  BA_RESULT_OPTIONS,
  FIELD_LABELS,
  QA_RESULT_OPTIONS,
  RESULT_LABELS,
  ROLE_LABELS,
  ROOT_CAUSE_LABELS,
  ROOT_CAUSE_OPTIONS,
  VALIDATION_LABEL,
  isHttpUrl,
} from "./constants";
import type { TLinkDraft } from "./fields";
import { EvidenceFileField, LinkListField, NoteField, TextField } from "./fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  update: TStructuredUpdate;
  /** The update this one corrects, when it is a correction. */
  corrects?: TStructuredUpdate;
  /** Only the most recent update on the work item can be corrected. */
  isLatest?: boolean;
  onChanged: () => void | Promise<unknown>;
};

const RESULT_VARIANT: Record<string, "success" | "danger"> = {
  passed: "success",
  approved: "success",
  failed: "danger",
  rejected: "danger",
};

/** Only render links we know are http(s); anything else is shown as plain text. */
function SafeLink({ url, label }: { url: string; label?: string }) {
  if (!isHttpUrl(url)) return <span className="break-all">{label || url}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="break-all text-accent-primary underline"
    >
      {label || url}
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption-md-medium text-tertiary">{label}</dt>
      {/* Plain text rendering: user input such as <b>bold</b> is shown literally. */}
      <dd className="text-body-sm-regular break-words whitespace-pre-wrap text-primary">{children}</dd>
    </div>
  );
}

function RevisionHistory({ revisions }: { revisions: TStructuredUpdateRevision[] }) {
  if (revisions.length === 0) return <p className="text-body-xs-regular text-tertiary">No edits.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {revisions.map((revision) => (
        <li key={revision.id} className="rounded-md bg-layer-2 p-2 text-body-xs-regular">
          <div className="text-tertiary">
            {revision.edited_by?.display_name ?? "Someone"} edited {renderFormattedDate(revision.created_at)}{" "}
            {new Date(revision.created_at).toLocaleTimeString()}
          </div>
          {Object.entries(revision.changes).map(([field, change]) => (
            <div key={field} className="mt-1">
              <span className="text-secondary">{FIELD_LABELS[field] ?? field}:</span>
              <div className="break-words whitespace-pre-wrap text-tertiary line-through">{change.old || "—"}</div>
              <div className="break-words whitespace-pre-wrap text-primary">{change.new || "—"}</div>
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** What a correction can switch to: the other result for QA/BA, a different category for Dev. */
export const correctionOptions = (update: TStructuredUpdate) => {
  if (update.role === "dev") return ROOT_CAUSE_OPTIONS.filter((o) => o.value !== update.root_cause_category);
  const options = update.role === "qa" ? QA_RESULT_OPTIONS : BA_RESULT_OPTIONS;
  return options.filter((o) => o.value !== update.result);
};

const lockedValueLabel = (update: TStructuredUpdate) =>
  update.role === "dev" ? ROOT_CAUSE_LABELS[update.root_cause_category] : RESULT_LABELS[update.result];

const formatDateTime = (value: string) => `${renderFormattedDate(value)} ${new Date(value).toLocaleTimeString()}`;

function CorrectionForm({
  update,
  busy,
  onCancel,
  onSubmit,
}: {
  update: TStructuredUpdate;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: TStructuredUpdateCorrectionPayload) => void;
}) {
  const options = correctionOptions(update);
  const [value, setValue] = useState<string>(options[0]?.value ?? "");
  const [reason, setReason] = useState("");
  const isDev = update.role === "dev";
  const field = isDev ? FIELD_LABELS.root_cause_category : FIELD_LABELS.result;
  return (
    <form
      className="mt-2 flex flex-col gap-3 rounded-md bg-layer-2 p-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim() || !value) return;
        onSubmit(
          isDev
            ? { root_cause_category: value as TStructuredUpdateCorrectionPayload["root_cause_category"], reason }
            : { result: value as TStructuredUpdateCorrectionPayload["result"], reason }
        );
      }}
    >
      <p className="text-body-xs-regular text-tertiary">
        Posts a new update that corrects this one. The original stays in the feed as posted, the state check is skipped,
        the work item moves to the state for the corrected value, and no new QA round is counted.
      </p>
      {options.length === 1 ? (
        <p className="text-body-sm-regular text-primary">
          {field}: {lockedValueLabel(update)} → {options[0].label}
        </p>
      ) : (
        <WorkflowSelect label={`${field} *`} value={value} options={options} onChange={setValue} />
      )}
      <NoteField
        label="Reason for the correction"
        required
        value={reason}
        error={reason.trim() ? undefined : "Required"}
        onChange={setReason}
      />
      <div className="flex justify-end gap-2">
        <Button stretch="auto" variant="secondary" size="sm" onClick={onCancel} disabled={busy} label="Cancel" />
        <Button
          stretch="auto"
          variant="primary"
          size="sm"
          type="submit"
          disabled={busy || !reason.trim() || !value}
          label="Post correction"
        />
      </div>
    </form>
  );
}

export const StructuredUpdateCard = observer(function StructuredUpdateCard(props: Props) {
  const { workspaceSlug, projectId, issueId, update, corrects, isLatest = false, onChanged } = props;
  const { data: currentUser } = useUser();
  const { getStateById } = useProjectState();
  const { fetchIssue, fetchActivities } = useIssueDetail();
  const [editing, setEditing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [notes, setNotes] = useState<TStructuredUpdateEditPayload>({});
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [links, setLinks] = useState<TLinkDraft[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [history, setHistory] = useState<TStructuredUpdateRevision[] | null>(null);
  const [busy, setBusy] = useState(false);

  const isAuthor = !!currentUser && update.actor?.id === currentUser.id;
  const fromState = update.from_state_id ? getStateById(update.from_state_id) : undefined;
  const toState = update.to_state_id ? getStateById(update.to_state_id) : undefined;
  const validationLabel = VALIDATION_LABEL[update.role];

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
      if (success) setToast({ type: "success", title: success });
    } catch (error) {
      setToast({ type: "error", title: "Could not save", message: workflowError(error) });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setNotes(
      update.role === "dev"
        ? { root_cause: update.root_cause, resolution: update.resolution, pr_link: update.pr_link }
        : update.role === "qa"
          ? { validation: update.validation, testmo_ref: update.testmo_ref }
          : { validation: update.validation }
    );
    setEditing(true);
  };

  const requiredMissing =
    update.role === "dev" ? !notes.root_cause?.trim() || !notes.resolution?.trim() : !notes.validation?.trim();
  const prLinkInvalid = !!notes.pr_link?.trim() && !isHttpUrl(notes.pr_link);

  const toggleHistory = async () => {
    if (history) return setHistory(null);
    try {
      setHistory(await service.revisions(workspaceSlug, projectId, issueId, update.id));
    } catch (error) {
      setToast({ type: "error", title: "Could not load history", message: workflowError(error) });
    }
  };

  return (
    <article
      className="my-2 rounded-lg border border-subtle bg-layer-1 p-3"
      aria-label={`${ROLE_LABELS[update.role]} update`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="brand" size="sm" label={ROLE_LABELS[update.role]} />
        {update.result && (
          <Badge variant={RESULT_VARIANT[update.result]} size="sm" label={RESULT_LABELS[update.result]} />
        )}
        {update.role === "qa" && <span className="text-body-xs-regular text-tertiary">Round {update.qa_round}</span>}
        <span className="text-body-xs-medium text-primary">{update.actor?.display_name ?? "Former member"}</span>
        <span className="text-body-xs-regular text-tertiary" title={new Date(update.created_at).toLocaleString()}>
          {calculateTimeAgo(update.created_at)}
        </span>
        {update.edited_at && (
          <button
            type="button"
            className="text-body-xs-regular text-tertiary underline"
            onClick={() => void toggleHistory()}
          >
            Edited
          </button>
        )}
        {update.state_gate_overridden && <Badge variant="warning" size="xs" label="State check overridden" />}
        {update.corrects_id && <Badge variant="warning" size="xs" label="Correction" />}
        {update.corrected_by_id && <Badge variant="neutral" size="xs" label="Corrected" />}
      </header>

      {update.corrects_id && (
        <p className="mt-1 text-body-xs-regular text-tertiary">
          {corrects
            ? `Corrects the update from ${formatDateTime(corrects.created_at)}: ${lockedValueLabel(corrects)} → ${lockedValueLabel(update)}`
            : "Corrects an earlier update"}
        </p>
      )}

      {fromState && toState && fromState.id !== toState.id && (
        <p className="mt-1 text-body-xs-regular text-tertiary">
          State: {fromState.name} → {toState.name}
        </p>
      )}

      {history && (
        <div className="mt-2">
          <RevisionHistory revisions={history} />
        </div>
      )}

      {!editing ? (
        <dl className="mt-2 flex flex-col gap-2">
          {update.correction_reason && <Field label="Reason for the correction">{update.correction_reason}</Field>}
          {update.role === "dev" && (
            <>
              <Field label={FIELD_LABELS.root_cause_category}>{ROOT_CAUSE_LABELS[update.root_cause_category]}</Field>
              <Field label={FIELD_LABELS.root_cause}>{update.root_cause}</Field>
              <Field label={FIELD_LABELS.resolution}>{update.resolution}</Field>
              {update.pr_link && (
                <Field label={FIELD_LABELS.pr_link}>
                  <SafeLink url={update.pr_link} />
                </Field>
              )}
            </>
          )}
          {update.role !== "dev" && (
            <>
              <Field label={FIELD_LABELS.result}>{RESULT_LABELS[update.result]}</Field>
              <Field label={validationLabel}>{update.validation}</Field>
              {update.testmo_ref && <Field label={FIELD_LABELS.testmo_ref}>{update.testmo_ref}</Field>}
            </>
          )}
        </dl>
      ) : (
        <form
          className="mt-2 flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (requiredMissing || prLinkInvalid) return;
            void run(async () => {
              await service.edit(workspaceSlug, projectId, issueId, update.id, notes);
              setEditing(false);
            }, "Update edited");
          }}
        >
          <p className="text-body-xs-regular text-tertiary">
            {update.role === "dev" ? "Root cause category" : "Result"} is locked. To change it, use the correct action
            on your latest update or post a new update.
          </p>
          {update.role === "dev" ? (
            <>
              <NoteField
                label={FIELD_LABELS.root_cause}
                required
                value={notes.root_cause ?? ""}
                error={notes.root_cause?.trim() ? undefined : "Required"}
                onChange={(v) => setNotes((n) => ({ ...n, root_cause: v }))}
              />
              <NoteField
                label={FIELD_LABELS.resolution}
                required
                value={notes.resolution ?? ""}
                error={notes.resolution?.trim() ? undefined : "Required"}
                onChange={(v) => setNotes((n) => ({ ...n, resolution: v }))}
              />
              <TextField
                label={FIELD_LABELS.pr_link}
                value={notes.pr_link ?? ""}
                error={prLinkInvalid ? "Only http and https links are allowed." : undefined}
                onChange={(v) => setNotes((n) => ({ ...n, pr_link: v }))}
              />
            </>
          ) : (
            <>
              <NoteField
                label={validationLabel}
                required
                value={notes.validation ?? ""}
                error={notes.validation?.trim() ? undefined : "Required"}
                onChange={(v) => setNotes((n) => ({ ...n, validation: v }))}
              />
              {update.role === "qa" && (
                <TextField
                  label={FIELD_LABELS.testmo_ref}
                  value={notes.testmo_ref ?? ""}
                  onChange={(v) => setNotes((n) => ({ ...n, testmo_ref: v }))}
                />
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              stretch="auto"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={busy}
              label="Cancel"
            />
            <Button
              stretch="auto"
              variant="primary"
              size="sm"
              type="submit"
              disabled={busy || requiredMissing || prLinkInvalid}
              label="Save"
            />
          </div>
        </form>
      )}

      {(update.links.length > 0 || update.evidence.length > 0) && (
        <section className="mt-3 flex flex-col gap-2" aria-label="Evidence">
          <span className="text-caption-md-medium text-tertiary">Evidence</span>
          {update.links.map((link) => (
            <div key={link.id} className="flex items-center gap-2 text-body-sm-regular">
              <SafeLink url={link.url} label={link.title} />
              {isAuthor && (
                <Button
                  stretch="auto"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    void run(() => service.removeLink(workspaceSlug, projectId, issueId, update.id, link.id))
                  }
                  label="Remove"
                />
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {update.evidence.map((asset) => {
              const src = service.evidenceUrl(asset.url, true);
              return (
                <figure key={asset.id} className="flex max-w-60 flex-col gap-1">
                  {asset.type.startsWith("video/") ? (
                    <video src={src} controls preload="metadata" className="max-h-40 rounded-md">
                      <track kind="captions" />
                    </video>
                  ) : (
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt={asset.name} loading="lazy" className="max-h-40 rounded-md object-cover" />
                    </a>
                  )}
                  <figcaption className="flex items-center justify-between gap-1 text-caption-sm-regular text-tertiary">
                    <span className="truncate">{asset.name}</span>
                    {isAuthor && (
                      <Button
                        stretch="auto"
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() =>
                          void run(() => service.removeEvidence(workspaceSlug, projectId, issueId, update.id, asset.id))
                        }
                        label="Remove"
                      />
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {isAuthor && addingEvidence && (
        <div className="mt-3 flex flex-col gap-3 rounded-md bg-layer-2 p-2">
          <LinkListField links={links} onChange={setLinks} />
          <EvidenceFileField
            files={files}
            onChange={setFiles}
            onError={(message) => setToast({ type: "error", title: "File not added", message })}
          />
          <div className="flex justify-end gap-2">
            <Button
              stretch="auto"
              variant="secondary"
              size="sm"
              onClick={() => setAddingEvidence(false)}
              disabled={busy}
              label="Cancel"
            />
            <Button
              stretch="auto"
              variant="primary"
              size="sm"
              disabled={busy || links.some((l) => l.url.trim() && !isHttpUrl(l.url))}
              onClick={() =>
                void run(async () => {
                  await Promise.all(
                    links
                      .filter((l) => l.url.trim())
                      .map((link) =>
                        service.addLink(workspaceSlug, projectId, issueId, update.id, { url: link.url.trim() })
                      )
                  );
                  for (const file of files)
                    // oxlint-disable-next-line no-await-in-loop -- upload large files one at a time
                    await service.uploadEvidence(workspaceSlug, projectId, issueId, update.id, file);
                  setLinks([]);
                  setFiles([]);
                  setAddingEvidence(false);
                }, "Evidence added")
              }
              label="Add evidence"
            />
          </div>
        </div>
      )}

      {isAuthor && correcting && (
        <CorrectionForm
          update={update}
          busy={busy}
          onCancel={() => setCorrecting(false)}
          onSubmit={(data) =>
            void run(async () => {
              const created = await service.correct(workspaceSlug, projectId, issueId, update.id, data);
              setCorrecting(false);
              void fetchIssue(workspaceSlug, projectId, issueId);
              void fetchActivities(workspaceSlug, projectId, issueId, "mutate");
              setToast({
                type: created.warning ? "warning" : "success",
                title: "Correction posted",
                message: created.warning ?? undefined,
              });
            })
          }
        />
      )}

      {isAuthor && !editing && !addingEvidence && !correcting && (
        <div className="mt-2 flex gap-2">
          <Button stretch="auto" variant="ghost" size="xs" onClick={startEdit} label="Edit notes" />
          <Button
            stretch="auto"
            variant="ghost"
            size="xs"
            onClick={() => setAddingEvidence(true)}
            label="Add evidence"
          />
          {isLatest && (
            <Button
              stretch="auto"
              variant="ghost"
              size="xs"
              onClick={() => setCorrecting(true)}
              label={update.role === "dev" ? "Correct category" : "Correct result"}
            />
          )}
        </div>
      )}
    </article>
  );
});
