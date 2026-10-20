import { API_BASE_URL } from "@plane/constants";
import { APIService } from "./api.service";

export type OfficeRole = "employee" | "admin" | "super_admin";
export type OfficeMember = {
  id: string;
  user_id: string;
  name: string;
  role: OfficeRole;
  department_id: number | null;
  position: string;
  active: boolean;
  online: boolean;
  timed_in_at: string | null;
};
export type OfficeDepartment = { id: number; name: string; color: string; order: number };
export type OfficeDesk = { id: number; department_id: number; number: number; member_id: string | null };
export type OfficeState = {
  name: string;
  me: OfficeMember;
  departments: OfficeDepartment[];
  desks: OfficeDesk[];
  members: OfficeMember[];
};
export type OfficeAdminState = {
  members: OfficeMember[];
  users: { id: string; email: string; display_name: string }[];
  audit: { id: number; action: string; created_at: string; details: Record<string, unknown> }[];
};
export type OfficeAction = {
  action: "reserve" | "release" | "time_in" | "time_out" | "heartbeat" | "member" | "settings" | "department";
  desk_id?: number;
  member_id?: string;
  user_id?: string;
  role?: OfficeRole;
  department_id?: number | null;
  position?: string;
  active?: boolean;
  name?: string;
  color?: string;
};
class VirtualOfficeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  async status(): Promise<{ allowed: boolean; member: OfficeMember | null }> {
    return (await this.get("/api/virtual-office/status/")).data;
  }
  async state(): Promise<OfficeState> {
    return (await this.get("/api/virtual-office/")).data;
  }
  async admin(q = ""): Promise<OfficeAdminState> {
    return (await this.get("/api/virtual-office/admin/", { params: { q } })).data;
  }
  async action(data: OfficeAction): Promise<void> {
    await this.post("/api/virtual-office/", data);
  }
}
export const virtualOfficeService = new VirtualOfficeService();
