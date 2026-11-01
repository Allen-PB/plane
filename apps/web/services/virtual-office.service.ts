import { API_BASE_URL } from "@plane/constants";
import { APIService } from "./api.service";

export type OfficeRole = "employee" | "admin" | "super_admin";
export type OfficeAppearanceMode = "automatic" | "day" | "night";
export type OfficeJobRole = { id: number; department_id: number; name: string; archived: boolean };
export type OfficeIdentity = {
  department_id: number | null;
  job_role_id: number | null;
  job_role_name: string;
  locked: boolean;
  pending: boolean;
};
export type WorkArrangement = "scheduled" | "output_based";
export type WorkingDay = { day: number; start: string; end: string; ends_next_day: boolean };
export type ScheduleRequest = {
  id: number;
  member_id: string;
  schedule: WorkingDay[];
  revision: number;
  status: "pending" | "approved" | "rejected" | "superseded";
  reason: string;
  created_at: string;
  decided_at: string | null;
  revisions: { revision: number; schedule: WorkingDay[]; created_at: string }[];
};
export type OfficeWorkState = {
  arrangement: WorkArrangement | null;
  schedule: WorkingDay[];
  policy_id: number | null;
  effective_from: string | null;
  timezone: string;
  requests: ScheduleRequest[];
};
export type OfficeNotice = { id: number; message: string; href?: string; created_at: string };
export type OfficeProfileState = OfficeIdentity & {
  departments: OfficeDepartment[];
  job_roles: OfficeJobRole[];
  notices: OfficeNotice[];
  work?: OfficeWorkState | null;
};
export type OfficeMember = {
  id: string;
  user_id: string;
  name: string;
  role: OfficeRole;
  department_id: number | null;
  position: string;
  job_role_id?: number | null;
  identity_pending?: boolean;
  avatar_style?: "male" | "female";
  active: boolean;
  online: boolean;
  timed_in_at: string | null;
};
export type OfficeDepartment = { id: number; name: string; color: string; order: number };
export type OfficeDesk = { id: number; department_id: number; number: number; member_id: string | null };
export type OfficeState = {
  attendance?: {
    session: AttendanceSession | null;
    choices: { date: string; expected_start: string; expected_end: string }[];
    suggested_date: string | null;
  };
  work?: OfficeWorkState;
  appearance_mode?: OfficeAppearanceMode;
  appearance?: "day" | "night";
  appearance_timezone?: string;
  server_time?: string;
  name: string;
  me: OfficeMember;
  departments: OfficeDepartment[];
  desks: OfficeDesk[];
  members: OfficeMember[];
};
export type OfficeAdminState = {
  members: OfficeMember[];
  users: { id: string; email: string; display_name: string; identity?: OfficeIdentity }[];
  identities?: Record<string, OfficeIdentity>;
  job_roles?: OfficeJobRole[];
  work?: Record<string, OfficeWorkState>;
  audit: { id: number; action: string; created_at: string; details: Record<string, unknown> }[];
};
export type OfficeAction = {
  shift_date?: string;
  confirmed?: boolean;
  employee_reason?: string;
  action:
    | "reserve"
    | "release"
    | "time_in"
    | "time_out"
    | "heartbeat"
    | "member"
    | "settings"
    | "department"
    | "avatar"
    | "appearance"
    | "prepare_time_in";
  // Employee identity changes are applied before recording the next session.
  appearance_mode?: OfficeAppearanceMode;
  avatar_style?: "male" | "female";
  desk_id?: number;
  member_id?: string;
  user_id?: string;
  role?: OfficeRole;
  department_id?: number | null;
  position?: string;
  job_role_id?: number;
  active?: boolean;
  arrangement?: WorkArrangement;
  schedule?: WorkingDay[];
  name?: string;
  color?: string;
};
export type AttendanceSession = {
  id: number;
  time_in: string | null;
  time_out: string | null;
  attendance_date: string;
  arrangement: string;
  expected_start: string | null;
  expected_end: string | null;
  arrival: string;
  departure: string;
  needs_review: boolean;
  reason: string;
  employee_reason: string;
  legacy: boolean;
  duration_seconds: number | null;
  in_progress: boolean;
};
export type AttendanceFilters = { start_date: string; end_date: string; member_id?: string; department_id?: number };
export type AttendanceRow = AttendanceSession & {
  employee_name: string;
  email: string;
  department: string;
  position: string;
  desk: string;
};
export type AttendanceReport = {
  id: string;
  filters: AttendanceFilters;
  rows: AttendanceRow[];
  generated_at: string;
  expires_at: string;
  timezone: string;
  columns: [keyof AttendanceRow, string][];
};
class VirtualOfficeService extends APIService {
  readonly recordsUrl = `${API_BASE_URL}/api/virtual-office/records.csv`;
  presenceRecordsUrl(range?: { start: string; end: string }): string {
    const params = new URLSearchParams(range ? { start_date: range.start, end_date: range.end } : { all_time: "true" });
    return `${this.recordsUrl}?${params.toString()}`;
  }
  private csrfToken: string | null = null;
  constructor() {
    super(API_BASE_URL);
  }
  async status(): Promise<{ allowed: boolean; member: OfficeMember | null }> {
    const data = (await this.get("/api/virtual-office/status/")).data;
    this.csrfToken = data.csrf_token;
    return data;
  }
  async state(): Promise<OfficeState> {
    return (await this.get("/api/virtual-office/")).data;
  }
  async admin(q = ""): Promise<OfficeAdminState> {
    return (await this.get("/api/virtual-office/admin/", { params: { q } })).data;
  }
  async profile(): Promise<OfficeProfileState> {
    const data = (await this.get("/api/virtual-office/profile/")).data;
    this.csrfToken = data.csrf_token;
    return data;
  }
  async saveProfile(data: { department_id: number; job_role_id: number }): Promise<OfficeIdentity> {
    if (!this.csrfToken) await this.profile();
    return (await this.patch("/api/virtual-office/profile/", data, { headers: { "X-CSRFToken": this.csrfToken } }))
      .data;
  }
  async saveJobRole(data: { id?: number; department_id?: number; name?: string; archived?: boolean }): Promise<void> {
    if (!this.csrfToken) await this.status();
    await this.post("/api/virtual-office/job-roles/", data, { headers: { "X-CSRFToken": this.csrfToken } });
  }
  async readNotice(id: number): Promise<void> {
    if (!this.csrfToken) await this.profile();
    await this.post(`/api/virtual-office/notices/${id}/read/`, {}, { headers: { "X-CSRFToken": this.csrfToken } });
  }
  async requestSchedule(schedule: WorkingDay[], revision: number): Promise<void> {
    if (!this.csrfToken) await this.profile();
    await this.post(
      "/api/virtual-office/schedule/",
      { schedule, revision },
      { headers: { "X-CSRFToken": this.csrfToken } }
    );
  }
  async decideSchedule(id: number, revision: number, decision: "approved" | "rejected", reason: string): Promise<void> {
    if (!this.csrfToken) await this.status();
    await this.post(
      `/api/virtual-office/schedule-requests/${id}/decision/`,
      { revision, decision, reason },
      { headers: { "X-CSRFToken": this.csrfToken } }
    );
  }
  async action(data: OfficeAction): Promise<void> {
    if (!this.csrfToken) await this.status();
    await this.post("/api/virtual-office/", data, { headers: { "X-CSRFToken": this.csrfToken } });
  }
  async createAttendanceReport(filters: AttendanceFilters): Promise<AttendanceReport> {
    if (!this.csrfToken) await this.status();
    return (
      await this.post("/api/virtual-office/attendance/reports/", filters, {
        headers: { "X-CSRFToken": this.csrfToken },
      })
    ).data;
  }
  async attendanceReport(id: string): Promise<AttendanceReport> {
    return (await this.get(`/api/virtual-office/attendance/reports/${id}/`)).data;
  }
  attendanceCSV(id: string): string {
    return `${API_BASE_URL}/api/virtual-office/attendance/reports/${id}/export.csv`;
  }
}
export const virtualOfficeService = new VirtualOfficeService();
