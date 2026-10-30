/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId, useState } from "react";
import { Button } from "@makeplane/propel/components/button";
import { TextArea, TextAreaGroup } from "@makeplane/propel/components/text-area";
import type { WorkflowConfig, WorkflowDraft, WorkflowLabel, WorkflowState } from "@/services/workflow.service";
import { WorkflowInput as Input, WorkflowSelect } from "./fields";

export const initialWorkflow = (): WorkflowDraft => ({
  name: "",
  description: "",
  config: {
    states: [
      { name: "Backlog", description: "", color: "#60646C", group: "backlog", default: true },
      { name: "Todo", description: "", color: "#60646C", group: "unstarted", default: false },
      { name: "In Progress", description: "", color: "#F59E0B", group: "started", default: false },
      { name: "Done", description: "", color: "#46A758", group: "completed", default: false },
      { name: "Cancelled", description: "", color: "#9AA4BC", group: "cancelled", default: false },
    ],
    labels: [],
    estimates: null,
  },
});
const groups: WorkflowState["group"][] = ["backlog", "unstarted", "started", "completed", "cancelled"];

type EditorDraft = Omit<WorkflowDraft, "config"> & {
  config: Omit<WorkflowConfig, "states" | "labels"> & {
    states: (WorkflowState & { editorKey: string })[];
    labels: (WorkflowLabel & { editorKey: string })[];
  };
};

export function WorkflowEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: WorkflowDraft;
  busy: boolean;
  onSave: (draft: WorkflowDraft) => void;
  onCancel: () => void;
}) {
  const fieldPrefix = useId();
  const [draft, setDraft] = useState<EditorDraft>(() => ({
    ...structuredClone(initial),
    config: {
      ...structuredClone(initial.config),
      states: initial.config.states.map((state) => ({ ...state, editorKey: crypto.randomUUID() })),
      labels: initial.config.labels.map((label) => ({ ...label, editorKey: crypto.randomUUID() })),
    },
  }));
  const [values, setValues] = useState(initial.config.estimates?.values.join(", ") ?? "1, 2, 3, 5, 8");
  const [estimateDraft, setEstimateDraft] = useState<NonNullable<WorkflowConfig["estimates"]>>(() =>
    structuredClone(
      initial.config.estimates ?? { name: "Fibonacci", type: "points", values: ["1", "2", "3", "5", "8"] }
    )
  );
  const { config } = draft;
  const setConfig = (next: typeof config) => setDraft({ ...draft, config: next });
  const move = (index: number, direction: number) => {
    const states = [...config.states];
    const other = index + direction;
    if (other < 0 || other >= states.length) return;
    [states[index], states[other]] = [states[other], states[index]];
    setConfig({ ...config, states });
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...draft,
          config: {
            ...config,
            states: config.states.map(({ editorKey: _key, ...state }) => state),
            labels: config.labels.map(({ editorKey: _key, ...label }) => label),
            estimates: config.estimates
              ? { ...config.estimates, values: values.split(",").map((v) => v.trim()) }
              : null,
          },
        });
      }}
      className="flex flex-col gap-5 rounded-lg border border-subtle p-5"
    >
      <fieldset disabled={busy} className="flex flex-col gap-5">
        <label htmlFor={fieldPrefix + "-1"} className="flex flex-col gap-1">
          Workflow name
          <Input
            id={fieldPrefix + "-1"}
            size="lg"
            required
            maxLength={255}
            placeholder="e.g. Engineering workflow"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label htmlFor={fieldPrefix + "-2"} className="flex flex-col gap-1">
          Description
          <TextAreaGroup resize="vertical">
            <TextArea
              id={fieldPrefix + "-2"}
              size="xl"
              surface="field"
              rows={3}
              placeholder="Describe when your team should use this workflow"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </TextAreaGroup>
        </label>
        <h3 className="text-heading-sm">States</h3>
        <p className="text-body-sm text-secondary">
          Order states and choose one default. Existing project states are retained when applying.
        </p>
        {config.states.map((state, index) => (
          <div key={state.editorKey} className="flex flex-wrap items-end gap-3 rounded-lg border border-subtle p-3">
            <label htmlFor={fieldPrefix + "-3-" + index} className="flex flex-col gap-1">
              State name
              <Input
                id={fieldPrefix + "-3-" + index}
                size="lg"
                required
                aria-label={"State name " + (index + 1)}
                placeholder="e.g. In review"
                maxLength={255}
                value={state.name}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    states: config.states.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)),
                  })
                }
              />
            </label>
            <WorkflowSelect
              label={"State group " + (index + 1)}
              value={state.group}
              options={groups.map((g) => ({ value: g, label: g }))}
              onChange={(group) =>
                setConfig({
                  ...config,
                  states: config.states.map((s, i) =>
                    i === index ? { ...s, group: group as WorkflowState["group"] } : s
                  ),
                })
              }
            />
            <label className="flex flex-col gap-1">
              Color
              <input
                aria-label={"State color " + (index + 1)}
                type="color"
                className="h-8 w-14 cursor-pointer rounded-md border border-strong bg-layer-2 p-1 disabled:cursor-not-allowed disabled:opacity-60"
                value={state.color}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    states: config.states.map((s, i) => (i === index ? { ...s, color: e.target.value } : s)),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="default-state"
                checked={state.default}
                onChange={() =>
                  setConfig({ ...config, states: config.states.map((s, i) => ({ ...s, default: i === index })) })
                }
              />
              Default
            </label>
            <Button
              size="lg"
              stretch="auto"
              type="button"
              variant="secondary"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={"Move state " + (index + 1) + " up"}
              label="Up"
            />
            <Button
              size="lg"
              stretch="auto"
              type="button"
              variant="secondary"
              disabled={index === config.states.length - 1}
              onClick={() => move(index, 1)}
              aria-label={"Move state " + (index + 1) + " down"}
              label="Down"
            />
            <Button
              size="lg"
              stretch="auto"
              type="button"
              variant="secondary"
              disabled={config.states.length === 1}
              onClick={() => {
                const states = config.states.filter((_, i) => i !== index);
                if (state.default) states[0] = { ...states[0], default: true };
                setConfig({ ...config, states });
              }}
              label="Remove state"
            />
          </div>
        ))}
        <Button
          size="lg"
          stretch="auto"
          type="button"
          variant="secondary"
          disabled={config.states.length >= 100}
          onClick={() =>
            setConfig({
              ...config,
              states: [
                ...config.states,
                {
                  editorKey: crypto.randomUUID(),
                  name: "",
                  description: "",
                  group: "started",
                  color: "#60646C",
                  default: false,
                },
              ],
            })
          }
          label="Add state"
        />
        <h3 className="text-heading-sm">Labels</h3>
        {config.labels.map((label, index) => (
          <div key={label.editorKey} className="flex flex-wrap items-end gap-3 rounded-lg border border-subtle p-3">
            <label htmlFor={fieldPrefix + "-4-" + index} className="flex flex-col gap-1">
              Label name
              <Input
                id={fieldPrefix + "-4-" + index}
                size="lg"
                required
                maxLength={255}
                value={label.name}
                placeholder="e.g. Bug"
                onChange={(e) =>
                  setConfig({
                    ...config,
                    labels: config.labels.map((l, i) => (i === index ? { ...l, name: e.target.value } : l)),
                  })
                }
              />
            </label>
            <label htmlFor={fieldPrefix + "-5-" + index} className="flex flex-col gap-1">
              Description
              <Input
                id={fieldPrefix + "-5-" + index}
                size="lg"
                value={label.description}
                placeholder="Describe this label"
                onChange={(e) =>
                  setConfig({
                    ...config,
                    labels: config.labels.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              Color
              <input
                type="color"
                value={label.color}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    labels: config.labels.map((l, i) => (i === index ? { ...l, color: e.target.value } : l)),
                  })
                }
              />
            </label>
            <Button
              size="lg"
              stretch="auto"
              type="button"
              variant="secondary"
              onClick={() => setConfig({ ...config, labels: config.labels.filter((_, i) => i !== index) })}
              label="Remove label"
            />
          </div>
        ))}
        <Button
          size="lg"
          stretch="auto"
          type="button"
          variant="secondary"
          disabled={config.labels.length >= 200}
          onClick={() =>
            setConfig({
              ...config,
              labels: [
                ...config.labels,
                { editorKey: crypto.randomUUID(), name: "", description: "", color: "#60646C" },
              ],
            })
          }
          label="Add label"
        />
        <h3 className="text-heading-sm">Estimates</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!config.estimates}
            onChange={(e) => {
              if (!e.target.checked && config.estimates) setEstimateDraft(config.estimates);
              setConfig({ ...config, estimates: e.target.checked ? estimateDraft : null });
            }}
          />
          Include estimate system
        </label>
        {!config.estimates && (
          <p className="text-body-sm text-secondary">Projects will keep their current estimate settings.</p>
        )}
        {config.estimates && (
          <>
            <label htmlFor={fieldPrefix + "-6"} className="flex flex-col gap-1">
              Estimate system name
              <Input
                id={fieldPrefix + "-6"}
                size="lg"
                required
                maxLength={255}
                value={config.estimates.name}
                placeholder="e.g. Fibonacci"
                onChange={(e) => setConfig({ ...config, estimates: { ...config.estimates!, name: e.target.value } })}
              />
            </label>
            <WorkflowSelect
              label="Estimate type"
              value={config.estimates.type}
              options={[
                { value: "points", label: "Points" },
                { value: "categories", label: "Categories" },
              ]}
              onChange={(type) =>
                setConfig({ ...config, estimates: { ...config.estimates!, type: type as "points" | "categories" } })
              }
            />
            <label htmlFor={fieldPrefix + "-7"} className="flex flex-col gap-1">
              Values, in order (comma separated, maximum 13)
              <Input
                id={fieldPrefix + "-7"}
                size="lg"
                required
                value={values}
                placeholder="e.g. 1, 2, 3, 5, 8"
                onChange={(e) => setValues(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="lg"
            stretch="auto"
            type="submit"
            disabled={busy}
            label={busy ? "Saving..." : "Save workflow"}
          />
          <Button size="lg" stretch="auto" type="button" variant="secondary" onClick={onCancel} label="Cancel" />
        </div>
      </fieldset>
    </form>
  );
}
