import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@makeplane/propel/components/combobox";
import type { OfficeAdminState } from "../../services/virtual-office.service";
// oxlint-disable-next-line import/no-unassigned-import
import "./sync-account-picker.css";

type AccountOption = { value: string; label: string };

export function SyncAccountPicker({
  admin,
  value,
  onChange,
  query,
  setQuery,
  disabled,
}: {
  admin: OfficeAdminState;
  value: string;
  onChange: (value: string) => void;
  query: string;
  setQuery: (query: string) => void;
  disabled: boolean;
}) {
  const options = admin.users.map((user) => ({ value: user.id, label: user.email }));
  const selected =
    options.find((option) => option.value === value) ??
    (value
      ? {
          value,
          label: admin.members.find((member) => member.user_id === value)?.name ?? value,
        }
      : null);
  return (
    <div className="vo-account-picker">
      <label id="office-user-label" htmlFor="office-user">
        Sync account
      </label>
      <Combobox<AccountOption, false>
        items={options}
        value={selected}
        onValueChange={(option) => onChange(option?.value ?? "")}
        inputValue={query}
        onInputValueChange={setQuery}
        onOpenChange={(open) => {
          if (!open) setQuery("");
        }}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(option, chosen) => option.value === chosen.value}
        filter={null}
        disabled={disabled}
        required
        name="sync_account"
      >
        <ComboboxTrigger
          id="office-user"
          size="lg"
          aria-labelledby="office-user-label"
          placeholder="Select an account"
        />
        <ComboboxContent
          data-office-account-popup=""
          aria-label="Choose a Sync account"
          sizing="anchor"
          search={<ComboboxSearch aria-label="Find a Sync account by email" placeholder="Search email…" />}
        >
          <ComboboxEmpty>No matching accounts.</ComboboxEmpty>
          <ComboboxList aria-label="Sync accounts">
            {(option: AccountOption) => (
              <ComboboxItem key={option.value} value={option} label={option.label} title={option.label} />
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
