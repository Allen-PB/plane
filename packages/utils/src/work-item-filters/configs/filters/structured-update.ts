/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

// ------------ Structured update result filters (QA / BA result, root cause, QA round) ------------

export type TStructuredUpdateFilterOption = { key: string; title: string };

export type TCreateStructuredUpdateFilterParams = TCreateFilterConfigParams & IFilterIconConfig<undefined>;

/**
 * Get a multi-select filter config over a fixed list of options
 * @param key - The filter key to use
 * @param label - The filter label
 * @param options - The selectable options
 */
export const getStructuredUpdateFilterConfig =
  <P extends TFilterProperty>(
    key: P,
    label: string,
    options: TStructuredUpdateFilterOption[]
  ): TCreateFilterConfig<P, TCreateStructuredUpdateFilterParams> =>
  (params: TCreateStructuredUpdateFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label,
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getMultiSelectConfig<TStructuredUpdateFilterOption, string>(
            {
              items: options,
              getId: (option) => option.key,
              getLabel: (option) => option.title,
              getValue: (option) => option.key,
            },
            { singleValueOperator: EQUALITY_OPERATOR.EXACT, ...updatedParams }
          )
        ),
      ]),
    });
