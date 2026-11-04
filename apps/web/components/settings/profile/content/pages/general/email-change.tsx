import { useState } from "react";
import { ChangeEmailModal } from "@/components/core/modals/change-email-modal";

export function ProfileEmailChange({
  allowed,
  smtpConfigured,
  label,
}: {
  allowed: boolean;
  smtpConfigured: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!allowed || !smtpConfigured) return null;
  return (
    <>
      <button type="button" className="btn w-fit text-11 text-secondary underline" onClick={() => setOpen(true)}>
        {label}
      </button>
      <ChangeEmailModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
