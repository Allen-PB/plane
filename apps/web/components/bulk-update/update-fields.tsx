import type { Dispatch, SetStateAction } from "react";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { WorkflowInput, WorkflowSelect } from "@/components/workflows/fields";
import type { BulkMetadata, BulkRequest } from "@/services/bulk-update.service";
import { ParentField } from "./parent-field";

const fields = [
  ["state_id", "State"],
  ["priority", "Priority"],
  ["assignee_ids", "Assignees"],
  ["label_ids", "Labels"],
  ["start_date", "Start Date"],
  ["target_date", "Due Date"],
  ["cycle_id", "Cycle"],
  ["module_ids", "Modules"],
  ["parent_id", "Parent"],
] as const;
const priorities = ["urgent", "high", "medium", "low", "none"];
type Props = {
  metadata: BulkMetadata;
  changes: BulkRequest["changes"];
  setChanges: Dispatch<SetStateAction<BulkRequest["changes"]>>;
  workspaceSlug: string;
  projectId: string;
  selectedIds: string[];
};
export function UpdateFields({ metadata, changes, setChanges, ...context }: Props) {
  const invalidDates = Boolean(changes.start_date && changes.target_date && changes.start_date > changes.target_date);
  return (
    <>
      <p className="text-body-sm-regular text-secondary">
        Enable the fields to change. All other fields stay as they are.
      </p>
      {fields.map(([field, label]) => {
        const enabled = Object.hasOwn(changes, field);
        const multiple = field === "assignee_ids" || field === "label_ids" || field === "module_ids";
        const date = field === "start_date" || field === "target_date";
        const options =
          field === "assignee_ids" ? metadata.members : field === "label_ids" ? metadata.labels : metadata.modules;
        return (
          <div key={field} className="space-y-3 rounded-lg border border-subtle p-4">
            <Checkbox
              label={`Change ${label}`}
              checked={enabled}
              onCheckedChange={(checked) =>
                setChanges((current) => {
                  const next = { ...current };
                  if (!checked) delete next[field];
                  else if (field === "assignee_ids" || field === "label_ids" || field === "module_ids")
                    next[field] = [];
                  else if (
                    field === "start_date" ||
                    field === "target_date" ||
                    field === "cycle_id" ||
                    field === "parent_id"
                  )
                    next[field] = null;
                  else next[field] = field === "priority" ? "none" : "";
                  return next;
                })
              }
            />
            {enabled &&
              (multiple ? (
                <>
                  <p className="text-body-sm-regular text-secondary">
                    Replace existing {label.toLowerCase()} with the selection below. Select none to clear{" "}
                    {label.toLowerCase()}.
                  </p>
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {options.length === 0 && (
                      <p className="text-body-sm-regular text-tertiary">
                        No {label.toLowerCase()} available in this project.
                      </p>
                    )}
                    {options.map((option) => (
                      <Checkbox
                        key={option.id}
                        label={option.name}
                        checked={(changes[field] as string[] | undefined)?.includes(option.id) ?? false}
                        onCheckedChange={(checked) =>
                          setChanges((current) => {
                            const ids = (current[field] as string[] | undefined) ?? [];
                            return {
                              ...current,
                              [field]: checked ? [...ids, option.id] : ids.filter((id) => id !== option.id),
                            };
                          })
                        }
                      />
                    ))}
                  </div>
                </>
              ) : date ? (
                <>
                  <WorkflowInput
                    type="date"
                    size="lg"
                    aria-label={label}
                    value={changes[field] ?? ""}
                    onChange={(event) => setChanges((current) => ({ ...current, [field]: event.target.value || null }))}
                  />
                  <p className="text-body-sm-regular text-secondary">
                    Leave the date empty to clear it. The final start date must be on or before the due date for every
                    selected work item.
                  </p>
                </>
              ) : field === "parent_id" ? (
                <ParentField
                  {...context}
                  value={changes.parent_id ?? null}
                  onChange={(id) => setChanges((current) => ({ ...current, parent_id: id }))}
                />
              ) : (
                <WorkflowSelect
                  label={label}
                  value={changes[field] ?? "clear"}
                  options={
                    field === "state_id"
                      ? metadata.states.map((s) => ({ value: s.id, label: s.name }))
                      : field === "cycle_id"
                        ? [
                            { value: "clear", label: "No cycle — remove existing cycle" },
                            ...metadata.cycles.map((c) => ({ value: c.id, label: c.name })),
                          ]
                        : priorities.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))
                  }
                  onChange={(value) =>
                    setChanges((current) => ({ ...current, [field]: value === "clear" ? null : value }))
                  }
                />
              ))}
          </div>
        );
      })}
      {invalidDates && (
        <p role="alert" className="text-body-sm-regular text-danger-primary">
          Start Date must be on or before Due Date.
        </p>
      )}
    </>
  );
}
