/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId, useRef } from "react";
import { Button } from "@makeplane/propel/components/button";
import { TextArea, TextAreaGroup } from "@makeplane/propel/components/text-area";
import { WorkflowInput } from "@/components/workflows/fields";
import { EVIDENCE_ACCEPT, EVIDENCE_MAX_BYTES, NOTE_MAX_LENGTH, isHttpUrl } from "./constants";

export function NoteField({
  label,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm-medium">
        {label}
        {required && <span className="text-danger-primary"> *</span>}
      </label>
      {/* The group draws the field border; without it the textarea blends into the card. */}
      <TextAreaGroup resize="none" data-invalid={!!error || undefined}>
        <TextArea
          id={id}
          size="md"
          surface="field"
          autoResize
          maxRows={10}
          maxLength={NOTE_MAX_LENGTH}
          value={value}
          aria-invalid={!!error || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </TextAreaGroup>
      {error && <span className="text-caption-md text-danger-primary">{error}</span>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm-medium">
        {label}
      </label>
      <WorkflowInput
        id={id}
        size="md"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="text-caption-md text-danger-primary">{error}</span>}
    </div>
  );
}

export type TLinkDraft = { url: string; title: string };

export function LinkListField({ links, onChange }: { links: TLinkDraft[]; onChange: (links: TLinkDraft[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-sm-medium">Evidence links</span>
      {links.map((link, index) => (
        <div key={index} className="flex flex-col gap-1 sm:flex-row sm:items-start">
          <div className="flex-1">
            <WorkflowInput
              size="md"
              value={link.url}
              placeholder="https://"
              aria-label={`Evidence link ${index + 1}`}
              onChange={(event) => onChange(links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))}
            />
            {link.url.trim() && !isHttpUrl(link.url) && (
              <span className="text-caption-md text-danger-primary">Only http and https links are allowed.</span>
            )}
          </div>
          <Button
            stretch="auto"
            variant="ghost"
            size="md"
            onClick={() => onChange(links.filter((_, i) => i !== index))}
            label="Remove"
          />
        </div>
      ))}
      <div>
        <Button
          stretch="auto"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...links, { url: "", title: "" }])}
          label="Add link"
        />
      </div>
    </div>
  );
}

export const evidenceFileError = (file: File) => {
  if (!EVIDENCE_ACCEPT.split(",").includes(file.type))
    return `${file.name}: only JPEG, PNG, GIF, WebP, MP4, WebM and MOV files are allowed.`;
  if (file.size > EVIDENCE_MAX_BYTES) return `${file.name}: files must be smaller than 50 MB.`;
  return null;
};

export function EvidenceFileField({
  files,
  onChange,
  onError,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <span id={`${id}-label`} className="text-body-sm-medium">
        Evidence files <span className="text-caption-md text-tertiary">(images or videos, up to 50 MB each)</span>
      </span>
      {/* The native picker is hidden; the themed button below opens it, like the CSV importer. */}
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          const errors = picked.map(evidenceFileError).filter(Boolean);
          if (errors.length) onError(errors.join(" "));
          onChange([...files, ...picked.filter((f) => !evidenceFileError(f))]);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          stretch="auto"
          variant="secondary"
          size="sm"
          onClick={() => input.current?.click()}
          aria-describedby={`${id}-label`}
          label="Choose files"
        />
        <span className="text-caption-md-regular text-tertiary" aria-live="polite">
          {files.length === 0 ? "No file chosen" : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
        </span>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((file, index) => (
            <li key={index} className="text-body-sm flex items-center justify-between gap-2">
              <span className="truncate">{file.name}</span>
              <Button
                stretch="auto"
                variant="ghost"
                size="sm"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                label="Remove"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
