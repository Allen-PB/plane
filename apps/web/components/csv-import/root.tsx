/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Button } from "@makeplane/propel/components/button";
import { Input } from "@makeplane/propel/components/input";
import { Switch } from "@makeplane/propel/components/switch";
import { Select, SelectContent, SelectItem, SelectList, SelectTrigger } from "@makeplane/propel/components/select";
import { csvImportService as service } from "@/services/csv-import.service";
import type { CSVImportConfig, CSVImportJob, CSVImportMetadata, CSVImportReview } from "@/services/csv-import.service";

function errorMessage(error: unknown) {
  if (isAxiosError(error)) {
    const detail: unknown = error.response?.data;
    if (detail && typeof detail === "object" && "error" in detail) return String(detail.error);
    if (error.response?.status === 403) return "Workspace administrator access is required.";
  }
  return "Request failed. Check your connection and try again.";
}

function Dropdown({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-sm-medium">{label}</span>
      <Select<string>
        items={options}
        value={value || null}
        onValueChange={(next) => onChange(next ?? "")}
        disabled={disabled}
      >
        <SelectTrigger size="lg" aria-label={label} placeholder="Select…" />
        <SelectContent>
          <SelectList>
            {options.map((option) => (
              <SelectItem size="lg" key={option.value} value={option.value} label={option.label} />
            ))}
          </SelectList>
        </SelectContent>
      </Select>
    </div>
  );
}

export function CSVImportRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [history, setHistory] = useState<CSVImportJob[]>([]);
  const [projectId, setProjectId] = useState("");
  const [metadata, setMetadata] = useState<CSVImportMetadata>();
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [job, setJob] = useState<CSVImportJob>();
  const [config, setConfig] = useState<CSVImportConfig>({ mapping: [], separator: "|", create_labels: false });
  const [review, setReview] = useState<CSVImportReview>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const running = job?.status === "queued" || job?.status === "processing";
  const jobId = job?.id;
  const draft = job?.status === "draft";
  const columns = job?.headers.map((header, index) => ({ header, index, id: `${job.id}-${index}` })) ?? [];

  useEffect(() => {
    let active = true;
    void service
      .list(workspaceSlug)
      .then((data) => {
        if (active) {
          setProjects(data.projects);
          setHistory(data.jobs);
        }
        return undefined;
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  useEffect(() => {
    setMetadata(undefined);
    if (!projectId) return;
    setMetadataLoading(true);
    let active = true;
    void service
      .metadata(workspaceSlug, projectId)
      .then((data) => {
        if (active) setMetadata(data);
        return undefined;
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setMetadataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    if (!running || !jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await service.detail(workspaceSlug, jobId);
        if (active) {
          setJob(next);
          setError("");
        }
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
      if (active)
        timer = setTimeout(() => {
          void poll();
        }, 2000);
    };
    timer = setTimeout(() => {
      void poll();
    }, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspaceSlug, jobId, running]);

  async function perform(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function changeConfig(next: CSVImportConfig) {
    setConfig(next);
    setReview(undefined);
  }
  async function openJob(next: CSVImportJob) {
    setProjectId(next.project_id);
    setJob(next);
    setConfig(next.config);
    setReview(undefined);
  }

  return (
    <div className="flex flex-col gap-6 text-body-sm-regular">
      <p>
        Import work items from a UTF-8 CSV. Maximum 5 MB and 10,000 rows per file. Name is required; other fields are
        optional.
      </p>
      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-danger-primary">
            {error}
          </p>
          <Button
            size="lg"
            variant="secondary"
            stretch="auto"
            label="Retry loading"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                const data = await service.list(workspaceSlug);
                setProjects(data.projects);
                setHistory(data.jobs);
                if (projectId) setMetadata(await service.metadata(workspaceSlug, projectId));
                if (job) setJob(await service.detail(workspaceSlug, job.id));
              });
            }}
          />
        </div>
      )}
      {loading ? (
        <p role="status">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p>No accessible active projects. Create or join a project before importing.</p>
      ) : (
        <Dropdown
          label="Project"
          value={projectId}
          disabled={busy || running || !!job}
          onChange={setProjectId}
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
        />
      )}
      {projectId && metadataLoading && <p role="status">Loading project fields, states and labels…</p>}
      {metadata && !job && (
        <label htmlFor="csv-import-upload" className="flex flex-col gap-2">
          Upload CSV
          <Input
            id="csv-import-upload"
            size="lg"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError("CSV must be at most 5 MB.");
                return;
              }
              void perform(async () => {
                await openJob(await service.upload(workspaceSlug, projectId, file));
              });
            }}
          />
        </label>
      )}
      {job && (
        <>
          <h3 className="text-heading-sm-medium">
            {job.project_name} · {job.total} rows
          </h3>
          {draft && metadata && (
            <>
              <h4 className="text-body-md-medium">Preview (first five rows)</h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr>
                      <th className="p-2">CSV line</th>
                      {columns.map(({ header, index: i, id }) => (
                        <th className="p-2" key={id}>
                          {header || `Column ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {job.sample.map((row) => (
                      <tr key={row.line}>
                        <td className="border-t border-subtle p-2">{row.line}</td>
                        {columns.map(({ index: i, id }) => (
                          <td className="max-w-64 truncate border-t border-subtle p-2" key={id} title={row.values[i]}>
                            {row.values[i] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="text-body-md-medium">Map CSV columns to Plane fields</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {columns.map(({ header, index: i, id }) => (
                  <Dropdown
                    key={id}
                    label={`${i + 1}. ${header || "Unnamed column"}`}
                    value={config.mapping[i] || "skip"}
                    disabled={busy}
                    options={[
                      { value: "skip", label: "Skip column" },
                      ...Object.entries(metadata.fields).map(([value, label]) => ({ value, label })),
                    ]}
                    onChange={(value) =>
                      changeConfig({
                        ...config,
                        mapping: config.mapping.map((field, index) =>
                          index === i ? (value === "skip" ? "" : value) : field
                        ),
                      })
                    }
                  />
                ))}
              </div>
              <p>Project states: {metadata.states.map((state) => state.name).join(", ") || "Default state only"}.</p>
              <p>Existing labels: {metadata.labels.map((label) => label.name).join(", ") || "No labels yet"}.</p>
              <p>
                Descriptions use plain text. Literal {"\\n"} sequences become line breaks, matching the desktop
                importer.
              </p>
              <label htmlFor="csv-label-separator" className="flex max-w-64 flex-col gap-2">
                Multiple-label separator
                <Input
                  id="csv-label-separator"
                  size="lg"
                  value={config.separator}
                  maxLength={10}
                  disabled={busy}
                  onChange={(event) => changeConfig({ ...config, separator: event.target.value })}
                />
              </label>
              <label htmlFor="csv-create-labels" className="flex items-center gap-3">
                <Switch
                  id="csv-create-labels"
                  size="sm"
                  checked={config.create_labels}
                  disabled={busy}
                  onCheckedChange={(checked) => changeConfig({ ...config, create_labels: checked })}
                />
                Create missing project labels
              </label>
              <Button
                size="lg"
                variant="primary"
                stretch="auto"
                label={busy ? "Validating…" : "Validate and review"}
                disabled={busy || !config.mapping.includes("name") || !config.separator}
                onClick={() => {
                  void perform(async () => {
                    const next = await service.action(workspaceSlug, job.id, "validate", config);
                    setJob(next);
                    setReview(next.review);
                  });
                }}
              />
              {review && (
                <section className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
                  <h4 className="text-heading-sm-medium">Review import into {job.project_name}</h4>
                  <ul>
                    {config.mapping.map(
                      (field, i) =>
                        field && (
                          <li key={field}>
                            {job.headers[i] || `Column ${i + 1}`} → {metadata.fields[field]}
                          </li>
                        )
                    )}
                  </ul>
                  <p>
                    {review.valid_count} valid rows; {review.errors.length} invalid rows will be skipped.
                  </p>
                  {review.missing_labels.length > 0 && (
                    <p>
                      Missing labels {config.create_labels ? "to create" : "requiring correction"}:{" "}
                      {review.missing_labels.join(", ")}
                    </p>
                  )}
                  <ErrorList errors={review.errors} />
                  {review.errors.length > 0 && (
                    <Button
                      size="lg"
                      variant="secondary"
                      stretch="auto"
                      label="Download invalid rows"
                      disabled={busy}
                      onClick={() => {
                        void perform(() => service.download(workspaceSlug, job.id));
                      }}
                    />
                  )}
                  <Button
                    size="lg"
                    variant="primary"
                    stretch="auto"
                    label={`Import ${review.valid_count} valid rows`}
                    disabled={busy || review.valid_count === 0}
                    onClick={() => {
                      void perform(async () => {
                        setJob(await service.action(workspaceSlug, job.id, "start", config));
                        setReview(undefined);
                      });
                    }}
                  />
                </section>
              )}
            </>
          )}
          {!draft && (
            <section className="flex flex-col gap-3" aria-live="polite">
              <p>
                Status: {job.status}. {job.processed} / {job.total} processed.
              </p>
              <progress className="w-full" value={job.processed} max={job.total} aria-label="Import progress" />
              <p>
                {job.succeeded} imported; {job.errors.length} failed; {job.total - job.processed} remaining.
              </p>
              {job.failure_reason && <p role="alert">{job.failure_reason}</p>}
              {job.status === "queued" && (
                <p>Waiting for the background worker. You can leave this page and reopen this import below.</p>
              )}
              <ErrorList errors={job.errors} />
              {(job.errors.length > 0 || job.status === "failed") && (
                <Button
                  size="lg"
                  variant="secondary"
                  stretch="auto"
                  label="Download failed and unimported rows"
                  disabled={busy}
                  onClick={() => {
                    void perform(() => service.download(workspaceSlug, job.id));
                  }}
                />
              )}
            </section>
          )}
          {!running && (
            <Button
              size="lg"
              variant="secondary"
              stretch="auto"
              label="Choose another CSV"
              disabled={busy}
              onClick={() => {
                setHistory((items) => [job, ...items.filter((item) => item.id !== job.id)]);
                setJob(undefined);
                setReview(undefined);
              }}
            />
          )}
        </>
      )}
      {!job && history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-heading-sm-medium">Recent imports</h3>
          {history.map((item) => (
            <Button
              size="lg"
              variant="secondary"
              stretch="auto"
              label={`${item.project_name} · ${item.status} · ${item.succeeded}/${item.total} imported`}
              key={item.id}
              disabled={busy}
              onClick={() => {
                void perform(async () => {
                  await openJob(await service.detail(workspaceSlug, item.id));
                });
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ErrorList({ errors }: { errors: { line: number; errors: string[] }[] }) {
  if (!errors.length) return null;
  return (
    <div className="max-h-72 overflow-auto" role="region" aria-label="Row errors">
      <ul>
        {errors.map((item) => (
          <li key={item.line} className="py-1">
            CSV line {item.line}: {item.errors.join("; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
