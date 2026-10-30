import { useRef } from "react";
import useSWR from "swr";
import useDebounce from "@/hooks/use-debounce";
import { bulkUpdateService as service } from "@/services/bulk-update.service";
import type { BulkFilters, BulkMetadata } from "@/services/bulk-update.service";

const emptyMetadata: BulkMetadata = { states: [], members: [], labels: [], cycles: [], modules: [], parents: [] };

export function useBulkData(
  workspaceSlug: string,
  projectId: string,
  page: number,
  search: string,
  retry: number,
  filters: BulkFilters
) {
  const debouncedSearch = useDebounce(search, 250);
  const projects = useSWR(["bulk-projects", workspaceSlug, retry], () => service.projects(workspaceSlug), {
    revalidateOnFocus: false,
  });
  const workItems = useSWR(
    projectId ? ["bulk-items", workspaceSlug, projectId, page, debouncedSearch, retry, filters] : null,
    () => service.items(workspaceSlug, projectId, page, debouncedSearch, filters),
    { revalidateOnFocus: false }
  );
  // Keep the project's filter options while a filter change reloads the list.
  const lastMetadata = useRef<{ projectId: string; metadata: BulkMetadata } | undefined>(undefined);
  if (workItems.data) lastMetadata.current = { projectId, metadata: workItems.data.metadata };
  const metadata = lastMetadata.current?.projectId === projectId ? lastMetadata.current.metadata : undefined;
  return {
    projects: projects.data ?? [],
    items: workItems.data?.results ?? [],
    count: workItems.data?.count ?? 0,
    metadata: { ...emptyMetadata, ...metadata },
    loading: projects.isLoading || Boolean(projectId && workItems.isLoading) || search !== debouncedSearch,
    error: projects.error || workItems.error,
  };
}
