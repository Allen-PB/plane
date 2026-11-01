import { useState } from "react";
import { Check, ArrowRight, ListChecks, Pencil, ArrowRightLeft, Archive } from "lucide-react";
import { Radio, RadioGroup } from "@makeplane/propel/components/radio";
import { Button } from "@makeplane/propel/components/button";
import { WorkflowSelect, workflowError } from "@/components/workflows/fields";
import { bulkUpdateService as service } from "@/services/bulk-update.service";
import type { BulkFilters, BulkOutcome, BulkPreview, BulkRequest, BulkWorkItem } from "@/services/bulk-update.service";
import { emptyFilters, queryFilters } from "./filters";
import { useBulkData } from "./use-data";
import { WorkItemSelection } from "./selection";
import { UpdateFields } from "./update-fields";
const steps = ["Choose Project", "Choose Work Items", "Choose Operation", "Operation Details", "Confirmation"];
const operations = [
  { value: "update", label: "Update", description: "Change fields across selected work items.", icon: Pencil },
  {
    value: "move",
    label: "Move",
    description: "Choose a destination project for each work item.",
    icon: ArrowRightLeft,
  },
  {
    value: "archive",
    label: "Archive",
    description: "Archive selected work items. Restore them later from project Archives.",
    icon: Archive,
  },
] as const;

export function BulkUpdateRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState<Record<string, BulkWorkItem>>({});
  const [operation, setOperation] = useState<BulkRequest["operation"]>("update");
  const [changes, setChanges] = useState<BulkRequest["changes"]>({});
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BulkPreview>();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<BulkFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<number>();
  const [retry, setRetry] = useState(0);
  const [outcomes, setOutcomes] = useState<BulkOutcome[]>([]);
  const {
    projects,
    items,
    count,
    metadata,
    loading,
    error: loadError,
  } = useBulkData(workspaceSlug, projectId, page, search, retry, queryFilters(filters));
  const shownError = error || (loadError ? workflowError(loadError) : "");
  const selectedItems = Object.values(selected);
  const project = projects.find((p) => p.id === projectId);
  const request: BulkRequest = {
    project_id: projectId,
    issue_ids: Object.keys(selected),
    operation,
    changes,
    destinations,
  };

  const changeProject = (id: string) => {
    setProjectId(id);
    setSelected({});
    setSearch("");
    setFilters(emptyFilters);
    setPage(1);
    setChanges({});
    setDestinations({});
    setPreview(undefined);
  };
  const toggle = (item: BulkWorkItem) =>
    setSelected((current) => {
      const next = { ...current };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });
  const hasSelection = selectedItems.length > 0 && selectedItems.length <= 100;
  const validDetails =
    operation === "archive" ||
    (operation === "update"
      ? Object.keys(changes).length > 0 &&
        (!Object.hasOwn(changes, "state_id") || Boolean(changes.state_id)) &&
        !(changes.start_date && changes.target_date && changes.start_date > changes.target_date)
      : selectedItems.every((item) => Boolean(destinations[item.id]) && destinations[item.id] !== projectId));
  const nextDisabled =
    busy ||
    loading ||
    (Boolean(shownError) && step < 2) ||
    (step === 0 ? !projectId : step === 1 ? !hasSelection : step === 3 ? !validDetails : false);
  const next = async () => {
    setError("");
    if (step !== 3) {
      setStep((s) => s + 1);
      return;
    }
    setBusy(true);
    try {
      setPreview(await service.preview(workspaceSlug, request));
      setStep(4);
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await service.apply(workspaceSlug, request, preview.token);
      setCompleted(result.count);
      setOutcomes(result.results ?? []);
      setPreview(undefined);
    } catch (e) {
      setError(workflowError(e));
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  };

  if (completed !== undefined)
    return (
      <div role="status" className="mt-8 rounded-xl border border-subtle bg-surface-1 p-8">
        <Check className="mb-3 size-7 text-accent-primary" aria-hidden="true" />
        <h2 className="text-h5-medium">Bulk operation complete</h2>
        <p className="my-3 text-body-sm-regular text-secondary">
          {completed} work items {operation === "archive" ? "archived" : operation === "move" ? "moved" : "updated"}.
        </p>
        {outcomes.length > 0 && (
          <ul className="my-4 space-y-2 text-body-sm-regular" aria-label="Archive results">
            {outcomes.map((item) => (
              <li key={item.id}>
                {item.key} · {item.name}: {item.status}
                {item.reason ? ` — ${item.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
        <Button
          stretch="auto"
          size="lg"
          variant="primary"
          label="Start another operation"
          onClick={() => {
            changeProject("");
            setCompleted(undefined);
            setOutcomes([]);
            setStep(0);
            setOperation("update");
            setRetry((v) => v + 1);
          }}
        />
      </div>
    );

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Bulk Update steps" className="lg:border-r lg:border-subtle lg:pr-6">
        <ol className="flex flex-col gap-1">
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-body-sm-medium text-secondary transition-colors ${step === index ? "bg-layer-transparent-selected text-primary" : ""}`}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center text-caption-md-medium ${index <= step ? "text-primary" : "text-tertiary"}`}
              >
                {index < step ? <Check className="size-3.5" aria-label="Complete" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </nav>
      <section aria-labelledby="bulk-step-title" className="min-w-0">
        <p className="mb-2 text-caption-md-regular text-tertiary">
          Step {step + 1} of {steps.length}
        </p>
        <h2 id="bulk-step-title" className="text-h6-medium text-primary">
          {steps[step]}
        </h2>
        {step > 0 && (
          <p className="mt-2 text-body-sm-regular text-secondary">
            {project?.name} · {selectedItems.length} work items selected
          </p>
        )}
        {shownError && (
          <div role="alert" className="my-4 rounded-lg border border-danger-strong p-4 text-body-sm-regular">
            <p>{shownError}</p>
            <Button
              stretch="auto"
              size="sm"
              variant="secondary"
              label="Reload"
              onClick={() => setRetry((v) => v + 1)}
              disabled={busy}
            />
          </div>
        )}
        <fieldset disabled={busy} className="mt-6 min-w-0 space-y-5">
          {step === 0 && (
            <>
              <p className="text-body-sm-regular text-secondary">
                Choose the project containing the work items you want to change.
              </p>
              <div className="max-w-lg">
                <WorkflowSelect
                  label="Project"
                  value={projectId}
                  onChange={changeProject}
                  disabled={loading}
                  options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.identifier})` }))}
                />
              </div>
              {loading ? (
                <p role="status">Loading projects...</p>
              ) : projects.length === 0 && !shownError ? (
                <p>No projects available. Admin access is required.</p>
              ) : null}
            </>
          )}
          {step === 1 && (
            <WorkItemSelection
              metadata={metadata}
              filters={filters}
              setFilters={setFilters}
              items={items}
              selected={selected}
              setSelected={setSelected}
              loading={loading}
              search={search}
              setSearch={setSearch}
              page={page}
              setPage={setPage}
              count={count}
              toggle={toggle}
            />
          )}
          {step === 2 && (
            <RadioGroup<BulkRequest["operation"]>
              density="comfortable"
              aria-label="Operation"
              value={operation}
              onValueChange={(value) => {
                setOperation(value);
                setPreview(undefined);
              }}
            >
              {operations.map(({ value, label, description, icon: Icon }) => (
                <label
                  key={value}
                  htmlFor={`bulk-operation-${value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${operation === value ? "border-strong bg-layer-transparent-selected" : "border-subtle hover:bg-layer-transparent-hover"}`}
                >
                  <Radio id={`bulk-operation-${value}`} value={value} />
                  <Icon className="mt-0.5 size-5 text-secondary" aria-hidden="true" />
                  <span>
                    <span className="block text-body-sm-medium">{label}</span>
                    <span className="mt-1 block text-body-sm-regular text-secondary">{description}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          )}
          {step === 3 && operation === "update" && (
            <UpdateFields
              metadata={metadata}
              changes={changes}
              setChanges={setChanges}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              selectedIds={Object.keys(selected)}
            />
          )}
          {step === 3 && operation === "move" && (
            <>
              <p className="text-body-sm-regular text-secondary">
                Choose a destination for each work item. The next step checks compatibility and shows the changes before
                anything moves.
              </p>
              {selectedItems.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-lg border border-subtle p-4 sm:grid-cols-2">
                  <p className="text-body-sm-medium">
                    {item.key}
                    <span className="font-normal mt-1 block text-secondary">{item.name}</span>
                  </p>
                  <WorkflowSelect
                    label={`Destination for ${item.key}`}
                    value={destinations[item.id] ?? ""}
                    options={projects.filter((p) => p.id !== projectId).map((p) => ({ value: p.id, label: p.name }))}
                    onChange={(id) => setDestinations((d) => ({ ...d, [item.id]: id }))}
                  />
                </div>
              ))}
            </>
          )}
          {step === 3 && operation === "archive" && (
            <div className="rounded-lg border border-subtle p-5">
              <Archive className="mb-3 size-5 text-secondary" aria-hidden="true" />
              <p className="text-body-md-medium">Archive {selectedItems.length} work items</p>
              <p className="mt-2 text-body-sm-regular text-secondary">
                Review the selected work items on the next step. Nothing is archived until you confirm.
              </p>
            </div>
          )}
          {step === 4 && preview && (
            <>
              <div className="rounded-lg border border-subtle p-5">
                <div className="flex items-center gap-2 text-body-md-medium">
                  <ListChecks className="size-5" aria-hidden="true" />
                  Review {operation} · {preview.count} work items
                </div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-body-sm-regular">
                  {preview.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-subtle">
                {preview.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex gap-3 border-b border-subtle p-3 text-body-sm-regular last:border-0"
                  >
                    <span className="shrink-0 text-accent-primary">{item.key}</span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-body-sm-regular text-secondary">
                Confirm to apply this operation to all selected work items.
              </p>
            </>
          )}
        </fieldset>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-5">
          <Button
            stretch="auto"
            size="lg"
            variant="secondary"
            label="Cancel"
            disabled={busy}
            onClick={() => {
              changeProject("");
              setStep(0);
              setError("");
            }}
          />
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                stretch="auto"
                size="lg"
                variant="secondary"
                label="Back"
                disabled={busy}
                onClick={() => {
                  setStep((s) => s - 1);
                  setPreview(undefined);
                  setError("");
                }}
              />
            )}
            {step < 4 ? (
              <Button
                stretch="auto"
                size="lg"
                variant="primary"
                label={busy ? "Preparing review..." : "Next"}
                icon={<ArrowRight className="size-4" />}
                iconPosition="end"
                disabled={nextDisabled}
                onClick={() => void next()}
              />
            ) : (
              <Button
                stretch="auto"
                size="lg"
                variant="primary"
                label={busy ? "Applying..." : "Confirm and Apply"}
                disabled={busy || !preview}
                onClick={() => void apply()}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
