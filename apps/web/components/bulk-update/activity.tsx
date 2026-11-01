import { observer } from "mobx-react";
import { ListChecks } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions/helpers/activity-block";

export const BulkWorkItemActivity = observer(function BulkWorkItemActivity({
  activityId,
  ends,
}: {
  activityId: string;
  ends: "top" | "bottom" | undefined;
}) {
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const activity = getActivityById(activityId);
  if (!activity || (activity.field === "project" && !activity.comment?.startsWith("Bulk Update: moved to ")))
    return null;
  return (
    <IssueActivityBlockComponent
      activityId={activityId}
      ends={ends}
      icon={<ListChecks className="size-3.5 text-secondary" aria-hidden="true" />}
    >
      {activity.field === "project" ? (
        <span>
          moved the work item from {activity.old_value} to {activity.new_value}.
        </span>
      ) : (
        <span title={activity.comment}>
          updated this work item in bulk. {activity.comment?.replace(/^Bulk Update:\s*/, "")}
        </span>
      )}
    </IssueActivityBlockComponent>
  );
});
