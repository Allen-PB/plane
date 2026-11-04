import type { ReactNode } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { useUser } from "@/hooks/store/user";
import { UserService } from "@/services/user.service";

const userService = new UserService();

/** God Mode is an instance permission, independent of Office and workspace roles. */
export const GodModeOnly = observer(function GodModeOnly({ children }: { children: ReactNode }) {
  const { data: user } = useUser();
  const { data, error } = useSWR(
    user?.id ? ["current-user-instance-admin", user.id] : null,
    () => userService.currentUserInstanceAdminStatus(),
    { keepPreviousData: false, shouldRetryOnError: false }
  );
  return user?.id && !error && data?.is_instance_admin === true ? <>{children}</> : null;
});
