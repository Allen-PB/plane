/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { Skeleton } from "@/components/common/skeleton";
// hooks
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";
// local
import { FeatureFlagsForm } from "./form";

const FeatureFlagsPage = observer(function FeatureFlagsPage(_props: Route.ComponentProps) {
  // store
  const { instanceConfigurations, fetchInstanceConfigurations } = useInstance();

  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  return (
    <PageWrapper
      header={{
        title: "Feature flags",
        description:
          "Turn PathBuilder Sync features on or off for the whole instance. Changes apply right away, without a restart, and no data is deleted.",
      }}
    >
      {instanceConfigurations ? (
        <FeatureFlagsForm configurations={instanceConfigurations} />
      ) : (
        <Skeleton className="space-y-8">
          <Skeleton.Item height="50px" width="50%" />
          <Skeleton.Item height="50px" width="20%" />
        </Skeleton>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Feature Flags - God Mode" }];

export default FeatureFlagsPage;
