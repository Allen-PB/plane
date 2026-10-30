import type { Dispatch, SetStateAction } from "react";
import { Checkbox } from "@makeplane/propel/components/checkbox";
import { Button } from "@makeplane/propel/components/button";
import { WorkflowInput } from "@/components/workflows/fields";
import type { BulkFilters, BulkMetadata, BulkWorkItem } from "@/services/bulk-update.service";
import { WorkItemFilters } from "./filters";

type Props = {
  metadata: BulkMetadata;
  filters: BulkFilters;
  setFilters: (filters: BulkFilters) => void;
  items: BulkWorkItem[];
  selected: Record<string, BulkWorkItem>;
  setSelected: Dispatch<SetStateAction<Record<string, BulkWorkItem>>>;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  count: number;
  toggle: (item: BulkWorkItem) => void;
};
export function WorkItemSelection({
  metadata,
  filters,
  setFilters,
  items,
  selected,
  setSelected,
  loading,
  search,
  setSearch,
  page,
  setPage,
  count,
  toggle,
}: Props) {
  const selectedItems = Object.values(selected);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <WorkflowInput
            size="lg"
            aria-label="Search work items"
            placeholder="Search by title or work item key"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span className="text-body-sm-regular text-secondary">{selectedItems.length} selected · Maximum 100</span>
        {selectedItems.length > 0 && (
          <Button
            stretch="auto"
            size="sm"
            variant="secondary"
            label="Clear selection"
            onClick={() => setSelected({})}
          />
        )}
      </div>
      <WorkItemFilters
        metadata={metadata}
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      <div className="overflow-x-auto rounded-lg border border-subtle" aria-busy={loading}>
        <table className="w-full text-left text-body-sm-regular">
          <thead className="bg-surface-2 text-secondary">
            <tr>
              <th className="p-3">
                <Checkbox
                  aria-label="Select all work items on this page"
                  disabled={loading || items.length === 0}
                  checked={items.length > 0 && items.every((item) => Boolean(selected[item.id]))}
                  indeterminate={
                    items.some((item) => Boolean(selected[item.id])) &&
                    !items.every((item) => Boolean(selected[item.id]))
                  }
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const result = { ...current };
                      for (const item of items) {
                        if (checked) result[item.id] = item;
                        else delete result[item.id];
                      }
                      return result;
                    })
                  }
                />
              </th>
              {["Key", "Work item", "State", "Priority", "Assignees", "Labels", "Start Date", "Due Date", "Parent"].map(
                (label) => (
                  <th key={label} className="p-3 font-medium whitespace-nowrap">
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-subtle ${selected[item.id] ? "bg-layer-transparent-selected" : "hover:bg-layer-transparent-hover"}`}
                >
                  <td className="p-3">
                    <Checkbox
                      aria-label={`Select ${item.key}`}
                      checked={Boolean(selected[item.id])}
                      onCheckedChange={() => toggle(item)}
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-accent-primary">{item.key}</td>
                  <td className="min-w-48 p-3">{item.name}</td>
                  <td className="p-3 whitespace-nowrap">{item.state}</td>
                  <td className="p-3 capitalize">{item.priority}</td>
                  <td className="p-3">{item.assignees.join(", ") || "Unassigned"}</td>
                  <td className="p-3">{item.labels.join(", ") || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{item.start_date ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{item.target_date ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{item.parent || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {(loading || items.length === 0) && (
          <p role="status" className="p-8 text-center text-secondary">
            {loading ? "Loading work items..." : "No work items found."}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-body-sm-regular">
        <span>
          {count} matching work items · Page {page} of {Math.max(1, Math.ceil(count / 25))}
        </span>
        <div className="flex gap-2">
          <Button
            stretch="auto"
            size="sm"
            variant="secondary"
            label="Previous page"
            disabled={loading || page === 1}
            onClick={() => setPage((p) => p - 1)}
          />
          <Button
            stretch="auto"
            size="sm"
            variant="secondary"
            label="Next page"
            disabled={loading || page * 25 >= count}
            onClick={() => setPage((p) => p + 1)}
          />
        </div>
      </div>
      {selectedItems.length > 100 && <p role="alert">Select up to 100 work items per operation.</p>}
    </>
  );
}
