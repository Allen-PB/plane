/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { StateGroupIcon } from "@plane/blocks/icons";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { RESULT_LABELS } from "./constants";
import { useIssueStructuredUpdates } from "./use-structured-updates";

type Props = { workspaceSlug: string; projectId: string; issueId: string };

const RESULT_CLASS: Record<string, string> = {
  passed: "text-success-primary",
  approved: "text-success-primary",
  failed: "text-danger-primary",
  rejected: "text-danger-primary",
};

/** "State · QA: <result> · round N · BA: <result>" shown at the top of the work item. */
export const StructuredUpdateSummaryBar = observer(function StructuredUpdateSummaryBar(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { enabled, data } = useIssueStructuredUpdates(workspaceSlug, projectId, issueId);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  if (!enabled) return null;

  const issue = getIssueById(issueId);
  const state = issue?.state_id ? getStateById(issue.state_id) : undefined;
  const summary = data?.summary;
  const qa = summary?.latest_qa_result;
  const ba = summary?.latest_ba_result;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-body-xs-medium"
      aria-label="Structured update summary"
    >
      {state && (
        <span className="flex items-center gap-1.5 text-primary">
          <StateGroupIcon stateGroup={state.group} color={state.color} />
          {state.name}
        </span>
      )}
      <span className="text-secondary">
        QA: <span className={qa ? RESULT_CLASS[qa] : "text-tertiary"}>{qa ? RESULT_LABELS[qa] : "—"}</span>
        {qa && <span className="text-tertiary"> · round {summary?.qa_round_count}</span>}
      </span>
      <span className="text-secondary">
        BA: <span className={ba ? RESULT_CLASS[ba] : "text-tertiary"}>{ba ? RESULT_LABELS[ba] : "—"}</span>
      </span>
    </div>
  );
});
