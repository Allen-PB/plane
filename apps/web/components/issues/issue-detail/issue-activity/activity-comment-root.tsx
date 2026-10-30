/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy } from "lodash-es";
import { observer } from "mobx-react";
// plane imports
import type { E_SORT_ORDER, TActivityFilters, EActivityFilterType } from "@plane/constants";
import { BASE_ACTIVITY_FILTER_TYPES, filterActivityOnSelectedFilters } from "@plane/constants";
import type { TCommentsOperations } from "@plane/types";
// components
import { CommentCard } from "@/components/comments/card/root";
import { StructuredUpdateCard } from "@/components/structured-updates/card";
import { useIssueStructuredUpdates } from "@/components/structured-updates/use-structured-updates";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueActivityItem } from "./activity/activity-list";
import { IssueActivityLoader } from "./loader";

const STRUCTURED_UPDATE = "STRUCTURED_UPDATE";

type TIssueActivityCommentRoot = {
  workspaceSlug: string;
  projectId: string;
  isIntakeIssue: boolean;
  issueId: string;
  selectedFilters: TActivityFilters[];
  activityOperations: TCommentsOperations;
  showAccessSpecifier?: boolean;
  disabled?: boolean;
  sortOrder: E_SORT_ORDER;
};

export const IssueActivityCommentRoot = observer(function IssueActivityCommentRoot(props: TIssueActivityCommentRoot) {
  const {
    workspaceSlug,
    isIntakeIssue,
    issueId,
    selectedFilters,
    activityOperations,
    showAccessSpecifier,
    projectId,
    disabled,
    sortOrder,
  } = props;
  // store hooks
  const {
    activity: { getActivityAndCommentsByIssueId },
    comment: { getCommentById },
  } = useIssueDetail();
  const { data: structuredUpdates, mutate: refreshStructuredUpdates } = useIssueStructuredUpdates(
    workspaceSlug,
    isIntakeIssue ? undefined : projectId,
    issueId
  );
  // derived values
  const activityAndComments = getActivityAndCommentsByIssueId(issueId, sortOrder);

  if (!activityAndComments) return <IssueActivityLoader />;

  // Structured updates are posted alongside comments, so they follow the Comments filter.
  const structuredItems = (structuredUpdates?.results ?? []).map((update) => ({
    id: update.id,
    activity_type: STRUCTURED_UPDATE,
    created_at: update.created_at,
  }));
  const updateById = new Map((structuredUpdates?.results ?? []).map((update) => [update.id, update]));
  // Results are ordered oldest first; only the newest update can be corrected.
  const latestUpdateId = structuredUpdates?.results.at(-1)?.id;
  const filteredActivityAndComments = orderBy(
    [
      ...filterActivityOnSelectedFilters(activityAndComments, selectedFilters),
      ...(selectedFilters.includes("COMMENT" as EActivityFilterType) ? structuredItems : []),
    ],
    (item) => new Date(item.created_at || 0),
    sortOrder
  );

  if (filteredActivityAndComments.length <= 0) return null;

  return (
    <div>
      {filteredActivityAndComments.map((activityComment, index) => {
        const comment = getCommentById(activityComment.id);
        const structuredUpdate =
          activityComment.activity_type === STRUCTURED_UPDATE ? updateById.get(activityComment.id) : undefined;
        if (structuredUpdate)
          return (
            <StructuredUpdateCard
              key={structuredUpdate.id}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              update={structuredUpdate}
              corrects={structuredUpdate.corrects_id ? updateById.get(structuredUpdate.corrects_id) : undefined}
              isLatest={structuredUpdate.id === latestUpdateId}
              onChanged={() => refreshStructuredUpdates()}
            />
          );
        return activityComment.activity_type === "COMMENT" ? (
          <CommentCard
            key={activityComment.id}
            workspaceSlug={workspaceSlug}
            entityId={issueId}
            comment={comment}
            activityOperations={activityOperations}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
            showAccessSpecifier={!!showAccessSpecifier}
            showCopyLinkOption={!isIntakeIssue}
            disabled={disabled}
            projectId={projectId}
            enableReplies
          />
        ) : BASE_ACTIVITY_FILTER_TYPES.includes(activityComment.activity_type as EActivityFilterType) ? (
          <IssueActivityItem
            key={activityComment.id}
            activityId={activityComment.id}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : null;
      })}
    </div>
  );
});
