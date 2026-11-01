/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { workflowService as service } from "@/services/workflow.service";
import type { SavedWorkflow, WorkflowDraft, WorkflowPreview } from "@/services/workflow.service";
import { WorkflowEditor, initialWorkflow } from "./editor";
import { WorkflowSelect, workflowError } from "./fields";

export function WorkflowRoot({ workspaceSlug, projectId }: { workspaceSlug: string; projectId?: string }) {
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ draft: WorkflowDraft; id?: string }>();
  const [deleting, setDeleting] = useState<string>();
  const [mode, setMode] = useState("manual");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<WorkflowPreview>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const data = await service.list(workspaceSlug, projectId);
        if (active) {
          setWorkflows(data);
          setError("");
        }
      } catch (e) {
        if (active) setError(workflowError(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [workspaceSlug, projectId, retry]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setBusy(false);
    }
  };
  const workflow = workflows.find((w) => w.id === selected);
  if (loading) return <p role="status">Loading workflows...</p>;
  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div role="alert" className="rounded-lg border border-subtle p-4">
          <p>{error}</p>
          <Button
            size="lg"
            stretch="auto"
            variant="secondary"
            onClick={() => setRetry((v) => v + 1)}
            disabled={busy}
            label="Reload workflows"
          />
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {projectId ? (
        <>
          <WorkflowSelect
            label="Setup method"
            value={mode}
            disabled={busy}
            options={[
              { value: "manual", label: "Manual setup" },
              { value: "saved", label: "Apply saved workflow" },
            ]}
            onChange={(value) => {
              setMode(value);
              setPreview(undefined);
            }}
          />
          {mode === "manual" ? (
            <p className="text-secondary">
              Configure States, Labels, and Estimates using their settings pages. Switching to manual setup keeps all
              current configuration.
            </p>
          ) : (
            <>
              {workflows.length === 0 ? (
                <p>
                  No saved workflows are available. Ask a workspace admin to create one in Workspace Settings /
                  Workflow.
                </p>
              ) : (
                <>
                  <WorkflowSelect
                    label="Saved workflow"
                    value={selected}
                    disabled={busy}
                    options={workflows.map((w) => ({ value: w.id, label: w.name }))}
                    onChange={(id) => {
                      setSelected(id);
                      setPreview(undefined);
                      setMapping({});
                    }}
                  />
                  {workflow && (
                    <>
                      <WorkflowSummary workflow={workflow} />
                      <p className="text-body-sm text-secondary">
                        Applying copies these settings. Existing states and labels stay available and matching names are
                        updated. Future template edits will not change this project. You can customize the project
                        afterward.
                      </p>
                      <Button
                        variant="primary"
                        size="lg"
                        stretch="auto"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const review = await service.preview(workspaceSlug, projectId, selected);
                            setPreview(review);
                            setMapping(Object.fromEntries(review.estimate_mapping.map((p) => [p.id, p.suggested])));
                          })
                        }
                        label={busy ? "Loading..." : "Preview changes"}
                      />
                    </>
                  )}
                  {preview && (
                    <div className="flex flex-col gap-4 rounded-lg border border-subtle p-5">
                      <h3 className="text-heading-sm">Review project changes</h3>
                      <ul className="list-inside list-disc">
                        {preview.changes.map((c) => (
                          <li key={c.section + ":" + c.name}>
                            {c.action}: {c.section}: {c.name}
                          </li>
                        ))}
                      </ul>
                      {preview.conflicts.map((c) => (
                        <p role="alert" key={c}>
                          {c}
                        </p>
                      ))}
                      {preview.estimate_mapping.length > 0 && (
                        <p>
                          Map the estimate values already assigned to work items. These assignments will move to the
                          selected values.
                        </p>
                      )}
                      {preview.estimate_mapping.map((point) => (
                        <WorkflowSelect
                          key={point.id}
                          label={"Replace estimate: " + point.value}
                          value={mapping[point.id] ?? ""}
                          disabled={busy}
                          options={(workflow?.config.estimates?.values ?? []).map((v) => ({ value: v, label: v }))}
                          onChange={(value) => setMapping({ ...mapping, [point.id]: value })}
                        />
                      ))}
                      <Button
                        variant="primary"
                        size="lg"
                        stretch="auto"
                        disabled={
                          busy || preview.conflicts.length > 0 || preview.estimate_mapping.some((p) => !mapping[p.id])
                        }
                        onClick={() =>
                          void run(async () => {
                            await service.apply(workspaceSlug, projectId, selected, preview.token, mapping);
                            window.location.reload();
                          })
                        }
                        label={busy ? "Applying..." : "Confirm and apply workflow"}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {!editor && (
            <Button
              variant="primary"
              size="lg"
              stretch="auto"
              onClick={() => {
                setEditor({ draft: initialWorkflow() });
                setDeleting(undefined);
              }}
              label="Create workflow"
            />
          )}
          {editor ? (
            <WorkflowEditor
              key={editor.id ?? editor.draft.name}
              initial={editor.draft}
              busy={busy}
              onCancel={() => setEditor(undefined)}
              onSave={(draft) =>
                void run(async () => {
                  const saved = await service.save(workspaceSlug, draft, editor.id);
                  setWorkflows((current) =>
                    [...current.filter((w) => w.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
                  );
                  setEditor(undefined);
                  setMessage("Workflow saved. Projects already using it remain independent.");
                })
              }
            />
          ) : (
            <>
              {workflows.length === 0 && !error && (
                <p>No workflows yet. Create one to reuse States, Labels, and Estimates across projects.</p>
              )}
              {workflows.map((w) => (
                <div key={w.id} className="flex flex-col gap-4 rounded-lg border border-subtle p-5">
                  <WorkflowSummary workflow={w} />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="lg"
                      stretch="auto"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditor({ id: w.id, draft: w });
                        setDeleting(undefined);
                      }}
                      label="Edit"
                    />
                    <Button
                      size="lg"
                      stretch="auto"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditor({
                          draft: {
                            name: w.name + " (copy)",
                            description: w.description,
                            config: structuredClone(w.config),
                          },
                        });
                        setDeleting(undefined);
                      }}
                      label="Duplicate"
                    />
                    <Button
                      size="lg"
                      stretch="auto"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setDeleting(w.id)}
                      label="Delete"
                    />
                  </div>
                  {deleting === w.id && (
                    <div className="flex flex-col gap-3">
                      <p>Delete "{w.name}"? Projects that used it will keep their configuration.</p>
                      <div className="flex gap-3">
                        <Button
                          variant="primary"
                          size="lg"
                          stretch="auto"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await service.remove(workspaceSlug, w.id);
                              setWorkflows((current) => current.filter((item) => item.id !== w.id));
                              setDeleting(undefined);
                              setMessage("Workflow deleted.");
                            })
                          }
                          label="Confirm deletion"
                        />
                        <Button
                          size="lg"
                          stretch="auto"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setDeleting(undefined)}
                          label="Cancel"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function WorkflowSummary({ workflow }: { workflow: SavedWorkflow }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-heading-sm">{workflow.name}</h3>
      {workflow.description && <p className="text-secondary">{workflow.description}</p>}
      <div>
        <h4 className="text-body-sm-medium">States</h4>
        <ol className="list-inside list-decimal">
          {workflow.config.states.map((s) => (
            <li key={s.name}>
              <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name} - {s.group}
              {s.default ? " - Default" : ""}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="text-body-sm-medium">Labels</h4>
        {workflow.config.labels.length ? (
          <ul className="list-inside list-disc">
            {workflow.config.labels.map((l) => (
              <li key={l.name}>
                <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
                {l.description ? " - " + l.description : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-secondary">No labels</p>
        )}
      </div>
      <div>
        <h4 className="text-body-sm-medium">Estimates</h4>
        <p>
          {workflow.config.estimates
            ? workflow.config.estimates.name +
              " (" +
              workflow.config.estimates.type +
              "): " +
              workflow.config.estimates.values.join(", ")
            : "Keep current project estimates"}
        </p>
      </div>
    </div>
  );
}
