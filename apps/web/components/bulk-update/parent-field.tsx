import { useState } from "react";
import useSWR from "swr";
import { Button } from "@makeplane/propel/components/button";
import useDebounce from "@/hooks/use-debounce";
import { WorkflowInput, WorkflowSelect, workflowError } from "@/components/workflows/fields";
import { bulkUpdateService } from "@/services/bulk-update.service";

export function ParentField({
  workspaceSlug,
  projectId,
  selectedIds,
  value,
  onChange,
}: {
  workspaceSlug: string;
  projectId: string;
  selectedIds: string[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<{ value: string; label: string }>();
  const query = useDebounce(search, 250);
  const { data, error, isLoading, mutate } = useSWR(
    ["bulk-parent", workspaceSlug, projectId, query],
    () => bulkUpdateService.items(workspaceSlug, projectId, 1, query),
    { revalidateOnFocus: false }
  );
  const options = [{ value: "clear", label: "No parent — remove existing parent" }];
  if (chosen && chosen.value === value) options.push(chosen);
  for (const item of data?.results ?? []) {
    if (!selectedIds.includes(item.id) && !options.some((option) => option.value === item.id))
      options.push({ value: item.id, label: `${item.key} · ${item.name}` });
  }
  return (
    <div className="space-y-3">
      <WorkflowInput
        size="lg"
        aria-label="Search parent work items"
        placeholder="Search parent by title or key"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <WorkflowSelect
        label="Parent"
        value={value ?? "clear"}
        options={options}
        disabled={isLoading || Boolean(error) || search !== query}
        onChange={(id) => {
          setChosen(options.find((option) => option.value === id));
          onChange(id === "clear" ? null : id);
        }}
      />
      {isLoading && <p role="status">Loading parent work items...</p>}
      {error && (
        <div role="alert">
          {workflowError(error)}{" "}
          <Button
            stretch="auto"
            size="sm"
            variant="secondary"
            label="Retry parent search"
            onClick={() => void mutate()}
          />
        </div>
      )}
      <p className="text-body-sm-regular text-secondary">
        Choose a parent in the same project, or remove the existing parent. Selected work items cannot be their own
        parent. Search to narrow the first 25 matches.
      </p>
    </div>
  );
}
