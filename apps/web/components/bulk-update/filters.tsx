import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { Button } from "@makeplane/propel/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { WorkflowInput } from "@/components/workflows/fields";
import type { BulkFilters, BulkMetadata } from "@/services/bulk-update.service";

export const emptyFilters: BulkFilters = {
  state_ids: [],
  priorities: [],
  assignee_ids: [],
  label_ids: [],
  parent_ids: [],
  start_date_from: "",
  start_date_to: "",
  due_date_from: "",
  due_date_to: "",
};

type ListKey = "state_ids" | "priorities" | "assignee_ids" | "label_ids" | "parent_ids";
type Option = { id: string; name: string };

const dateRanges = [
  ["Start Date", "start_date_from", "start_date_to"],
  ["Due Date", "due_date_from", "due_date_to"],
] as const;

const invalidRanges = (filters: BulkFilters) =>
  dateRanges.filter(([, from, to]) => filters[from] && filters[to] && filters[from] > filters[to]);

/** Reversed date ranges are shown as errors and left out of the query. */
export function queryFilters(filters: BulkFilters): BulkFilters {
  const result = { ...filters };
  for (const [, from, to] of invalidRanges(filters)) {
    result[from] = "";
    result[to] = "";
  }
  return result;
}

function FilterChip({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            // Highlighted while open (like Jira) and while it has selections.
            className={`group flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-body-sm-medium transition-colors data-[popup-open]:border-accent-strong data-[popup-open]:bg-accent-subtle data-[popup-open]:text-accent-primary ${count > 0 ? "border-accent-strong bg-accent-subtle text-accent-primary" : "border-subtle text-secondary hover:bg-layer-transparent-hover"}`}
          />
        }
      >
        {count > 0 ? `${label} · ${count}` : label}
        <ChevronDown className="size-3.5 transition-transform group-data-[popup-open]:rotate-180" aria-hidden="true" />
      </PopoverTrigger>
      {/* Stay below the chip like Jira; the list scrolls instead of the panel flipping over the filters. */}
      <PopoverContent
        variant="rich"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        collisionAvoidance={{ side: "none", align: "shift" }}
      >
        <div role="group" aria-label={`${label} filter`} className="flex min-h-0 w-72 flex-col gap-2 p-2">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ListFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const shown = options.filter((option) => option.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <FilterChip label={label} count={value.length}>
      <WorkflowInput
        size="md"
        aria-label={`Search ${label.toLowerCase()} options`}
        placeholder={`Search ${label}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div role="list" className="flex max-h-72 min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {shown.length === 0 && <p className="px-2 py-1.5 text-body-sm-regular text-tertiary">No matching options.</p>}
        {shown.map((option, index) => {
          const checked = value.includes(option.id);
          return (
            <div
              key={option.id}
              role="listitem"
              className={`rounded-md px-2 py-1.5 transition-colors ${checked ? "bg-layer-transparent-selected" : "hover:bg-layer-transparent-hover"} ${option.id === "none" && index < shown.length - 1 ? "mb-1 rounded-b-none border-b border-subtle" : ""}`}
            >
              <Checkbox
                stretch="full"
                label={option.name}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next ? [...value, option.id] : value.filter((id) => id !== option.id))
                }
              />
            </div>
          );
        })}
      </div>
    </FilterChip>
  );
}

type Props = {
  metadata: BulkMetadata;
  filters: BulkFilters;
  onChange: (filters: BulkFilters) => void;
};
export function WorkItemFilters({ metadata, filters, onChange }: Props) {
  const lists: [string, ListKey, Option[]][] = [
    ["State", "state_ids", metadata.states],
    [
      "Priority",
      "priorities",
      ["urgent", "high", "medium", "low", "none"].map((p) => ({ id: p, name: p[0].toUpperCase() + p.slice(1) })),
    ],
    ["Assignee", "assignee_ids", [{ id: "none", name: "Unassigned" }, ...metadata.members]],
    ["Label", "label_ids", [{ id: "none", name: "No labels" }, ...metadata.labels]],
    ["Parent", "parent_ids", [{ id: "none", name: "No parent" }, ...metadata.parents]],
  ];
  const active = Object.values(filters).some((value) => value.length > 0);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {lists.map(([label, key, options]) => (
          <ListFilter
            key={key}
            label={label}
            options={options}
            value={filters[key]}
            onChange={(value) => onChange({ ...filters, [key]: value })}
          />
        ))}
        {dateRanges.map(([label, from, to]) => (
          <FilterChip key={label} label={label} count={[filters[from], filters[to]].filter(Boolean).length}>
            {(
              [
                [from, "From"],
                [to, "To"],
              ] as const
            ).map(([key, bound]) => (
              <label key={key} className="block space-y-1 text-body-sm-regular text-secondary">
                {bound}
                <WorkflowInput
                  type="date"
                  size="md"
                  aria-label={`${label} ${bound}`}
                  value={filters[key]}
                  onChange={(event) => onChange({ ...filters, [key]: event.target.value })}
                />
              </label>
            ))}
          </FilterChip>
        ))}
        {active && (
          <Button
            stretch="auto"
            size="sm"
            variant="ghost"
            label="Clear filters"
            onClick={() => onChange(emptyFilters)}
          />
        )}
      </div>
      {invalidRanges(filters).map(([label]) => (
        <p key={label} role="alert" className="text-body-sm-regular text-danger-primary">
          {label} From must be on or before {label} To.
        </p>
      ))}
    </>
  );
}
