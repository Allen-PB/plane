/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Popover, PopoverBody, PopoverContent, PopoverTrigger } from "@makeplane/propel/components/popover";
import { InfoOutline } from "@makeplane/propel/icons";

export type WorkItemGuidanceField = "title" | "description";

type FieldGuidanceProps = {
  field: WorkItemGuidanceField;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WorkItemFieldGuidance({ field, open, onOpenChange }: FieldGuidanceProps) {
  const title = field === "title";
  const label = title ? "Title" : "Description";

  return (
    <div className="mb-2 flex items-center gap-1 text-body-sm-medium">
      {title ? <label htmlFor="name">Title</label> : <span id="work-item-description-label">Description</span>}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`${label} guidance`}
              className="focus-visible:outline-accent-primary grid size-7 shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-1 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          }
        >
          <InfoOutline className="size-4" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          variant="text"
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={`${label} guidance`}
          onKeyDown={(event) => {
            // Escape belongs to this popover, not the creation form's document listener.
            if (event.key === "Escape") {
              event.stopPropagation();
              onOpenChange(false);
            }
          }}
        >
          <PopoverBody tabIndex={0} render={<div className="max-h-[70dvh] text-body-sm-regular" />}>
            {title ? (
              <div className="space-y-3">
                <h4 className="text-body-sm-medium">Naming convention</h4>
                <p>Summary - Module - User role - Device - OS - Type</p>
                <p>Type: Issue or Request</p>
                <div className="space-y-1">
                  <p className="text-body-sm-medium">Example:</p>
                  <p>Unable to log in - Accounts - Admin - Desktop - Windows - Issue</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <section className="space-y-2">
                  <h4 className="text-body-sm-medium">For an Issue</h4>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Issue Description</li>
                    <li>Steps to Reproduce</li>
                    <li>Actual Result</li>
                    <li>Expected Result</li>
                  </ol>
                </section>
                <section className="space-y-2">
                  <h4 className="text-body-sm-medium">For a Request</h4>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Request Description</li>
                    <li>Reason</li>
                    <li>Expected Outcome</li>
                  </ol>
                </section>
              </div>
            )}
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </div>
  );
}
