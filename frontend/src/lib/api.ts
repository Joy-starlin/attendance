const API_BASE = import.meta.env.VITE_API_BASE || "";

export type UserRole = "admin" | "lecturer" | "student";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  lecturer_id: string | null;
  lecturer_name?: string | null;
  description?: string | null;
  total_classes?: number | null;
  pass_criteria?: number | null;
};

export type Student = {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  year_of_study: number | null;
  phone?: string | null;
  has_fingerprint?: boolean;
};

export type Fingerprint = {
  id: string;
  finger_number: number;
  quality_score: number;
  is_primary: boolean;
  device_id: string | null;
  created_at?: string;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function getToken() {
  return localStorage.getItem("token");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "error" in (body as any)
        ? String((body as any).error)
        : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    employee_id?: string;
    department?: string;
    student_id?: string;
    year_of_study?: number;
  }) =>
    request<LoginResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  courses: () => request<Course[]>("/api/courses"),
  lecturerCourseUnits: (lecturerId: string) =>
    request<Array<Pick<Course, "id" | "code" | "name" | "lecturer_id">>>(
      `/api/lecturers/${lecturerId}/course-units`
    ),
  courseStudents: (courseId: string) =>
    request<Student[]>(`/api/course-units/${courseId}/students`),

  createSession: (payload: {
    course_unit_id: string;
    duration_minutes?: number;
    device_id?: string;
    session_type?: string;
  }) =>
    request<{
      session_id: string;
      course_unit_id: string;
      status: string;
      duration_minutes: number;
      device_id: string | null;
    }>("/api/sessions", { method: "POST", body: JSON.stringify(payload) }),
  stopSession: (sessionId: string) =>
    request<{ success: true }>(`/api/sessions/${sessionId}/stop`, { method: "POST" }),

  students: () => request<Student[]>("/api/students"),
  student: (id: string) => request<Student>(`/api/students/${id}`),
  studentFingerprints: (id: string) =>
    request<Fingerprint[]>(`/api/students/${id}/fingerprints`),

  createFingerprint: (payload: {
    student_id: string;
    finger_number: number;
    fp_template?: string;
    quality_score?: number;
    device_id?: string;
  }) =>
    request<{
      id: string;
      student_id: string;
      finger_number: number;
      quality_score: number;
      is_primary: boolean;
    }>("/api/fingerprints", { method: "POST", body: JSON.stringify(payload) }),
  deleteFingerprint: (id: string) =>
    request<{ success: true }>(`/api/fingerprints/${id}`, { method: "DELETE" }),
  setPrimaryFingerprint: (id: string) =>
    request<{ success: true }>(`/api/fingerprints/${id}/set-primary`, { method: "PUT" }),

  exportFingerprintsUrl: () => request<{ download_url: string }>("/api/fingerprints/export"),
  devices: () =>
    request<
      Array<{
        id: string;
        name: string | null;
        location: string | null;
        status: "online" | "offline" | "maintenance";
        last_seen: string | null;
        battery_level: number | null;
        signal_strength: number | null;
        firmware_version: string | null;
        total_scans: number;
        type: string;
      }>
    >("/api/devices"),
  enrollDevice: (deviceId: string, studentId: string) =>
    request<{ success: true }> (`/api/devices/${deviceId}/enroll`, {
      method: "POST",
      body: JSON.stringify({ student_id: studentId }),
    }),
};

