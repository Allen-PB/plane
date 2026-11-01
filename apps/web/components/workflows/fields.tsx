/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, type ComponentProps } from "react";
import { Input, InputGroup } from "@makeplane/propel/components/input";
import { Select, SelectContent, SelectItem, SelectList, SelectTrigger } from "@makeplane/propel/components/select";
import { isAxiosError } from "axios";

export function WorkflowInput(props: ComponentProps<typeof Input>) {
  const [invalid, setInvalid] = useState(false);
  return (
    <InputGroup size={props.size} data-invalid={invalid || undefined}>
      <Input
        {...props}
        aria-invalid={invalid || undefined}
        data-invalid={invalid || undefined}
        onInvalid={(event) => {
          setInvalid(true);
          props.onInvalid?.(event);
        }}
        onChange={(event) => {
          setInvalid(false);
          props.onChange?.(event);
        }}
      />
    </InputGroup>
  );
}

export function WorkflowSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <span className="text-body-sm-medium">{label}</span>
      <Select<string>
        items={options}
        value={value || null}
        onValueChange={(v) => onChange(v ?? "")}
        disabled={disabled}
      >
        <SelectTrigger size="lg" aria-label={label} placeholder="Select..." />
        <SelectContent>
          <SelectList>
            {options.map((o) => (
              <SelectItem size="lg" key={o.value} value={o.value} label={o.label} />
            ))}
          </SelectList>
        </SelectContent>
      </Select>
    </div>
  );
}
function flatten(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, v]) => key + ": " + flatten(v))
      .join(" ");
  return String(value);
}

export function workflowError(error: unknown): string {
  if (isAxiosError(error) && error.response?.data) {
    return flatten(error.response.data);
  }
  return "Unable to complete the request. Please try again.";
}
