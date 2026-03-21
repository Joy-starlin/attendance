import React from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, Plus, FileDown, Upload, PlayCircle,
  StopCircle, Fingerprint, ChevronDown, ChevronRight, RefreshCw, X
} from "lucide-react";

type Course = {
  id: string; code: string; name: string;
  lecturer_name?: string; total_classes?: number; pass_criteria?: number;
};
type Student = {
  id: string; name: string; student_id: string;
  classes_attended: number; total_sessions: number; has_fingerprint: number;
};
type Session = { session_id: string } | null;

// ── helpers ──────────────────────────────────────────────────────────────────
async function apiRequest(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.json();
}

function parseCSV(text: string): { name: string; student_id: string }[] {
  const lines = text.trim().split(/\r?\n/);
  // skip header line
  return lines.slice(1).map(l => {
    const [name, student_id] = l.split(",").map(s => s.trim());
    return { name, student_id };
  }).filter(r => r.name && r.student_id);
}

function generatePDF(course: Course, students: Student[]) {
  const win = window.open("", "_blank")!;
  const rows = students.map((s, i) => {
    const pct = s.total_sessions > 0 ? Math.round((s.classes_attended / s.total_sessions) * 100) : 0;
    const passed = pct >= (course.pass_criteria ?? 75);
    return `<tr style="background:${i % 2 ? '#f9fafb' : '#fff'}">
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${s.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${s.student_id || "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${s.classes_attended}/${s.total_sessions}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${pct}%</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:${passed ? '#16a34a' : '#dc2626'};font-weight:600">${passed ? "PASS" : "FAIL"}</td>
    </tr>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html><head><title>Attendance Report — ${course.name}</title>
  <style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left}@media print{button{display:none}}</style>
  </head><body>
  <h1>Bugema University — Attendance Report</h1>
  <p><strong>Course:</strong> ${course.code} — ${course.name}</p>
  <p><strong>Pass Criteria:</strong> ${course.pass_criteria ?? 75}% attendance required</p>
  <button onclick="window.print()" style="margin:12px 0;padding:8px 18px;background:#1e3a5f;color:#fff;border:none;border-radius:4px;cursor:pointer">🖨 Print / Save as PDF</button>
  <table><thead><tr><th>#</th><th>Student Name</th><th>Reg. No.</th><th>Attended</th><th>%</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p style="margin-top:24px;font-size:12px;color:#6b7280">Generated on ${new Date().toLocaleString()}</p>
  </body></html>`);
  win.document.close();
}

// ── main component ────────────────────────────────────────────────────────────
export function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<Record<string, Student[]>>({});
  const [activeSessions, setActiveSessions] = React.useState<Record<string, Session>>({});
  const [devices, setDevices] = React.useState<{ id: string; name: string }[]>([]);
  const [showAddCourse, setShowAddCourse] = React.useState(false);
  const [newCourse, setNewCourse] = React.useState({ code: "", name: "", total_classes: "42", pass_criteria: "75" });
  const [csvStatus, setCsvStatus] = React.useState<Record<string, string>>({});
  const [enrollTarget, setEnrollTarget] = React.useState<{ courseId: string; studentId: string; studentName: string } | null>(null);
  const [selectedDevice, setSelectedDevice] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([apiRequest("/api/courses"), apiRequest("/api/devices").catch(() => [])]);
      setCourses(c);
      setDevices(d);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function loadStudents(courseId: string) {
    const s = await apiRequest(`/api/courses/${courseId}/students`).catch(() => []);
    setStudents(prev => ({ ...prev, [courseId]: s }));
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadStudents(id);
  }

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/api/courses", { method: "POST", body: JSON.stringify({ ...newCourse, total_classes: +newCourse.total_classes, pass_criteria: +newCourse.pass_criteria }) });
    setShowAddCourse(false);
    setNewCourse({ code: "", name: "", total_classes: "42", pass_criteria: "75" });
    load();
  }

  async function startSession(courseId: string) {
    const deviceId = selectedDevice || (devices[0]?.id);
    if (!deviceId) return alert("No device selected.");
    const r = await apiRequest("/api/sessions", { method: "POST", body: JSON.stringify({ course_id: courseId, device_id: deviceId }) });
    setActiveSessions(prev => ({ ...prev, [courseId]: r }));
  }

  async function stopSession(courseId: string) {
    const s = activeSessions[courseId];
    if (!s) return;
    await apiRequest(`/api/sessions/${s.session_id}/stop`, { method: "POST" });
    setActiveSessions(prev => { const n = { ...prev }; delete n[courseId]; return n; });
    loadStudents(courseId);
  }

  function handleCSVUpload(courseId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsed = parseCSV(ev.target?.result as string);
      if (parsed.length === 0) { setCsvStatus(p => ({ ...p, [courseId]: "❌ No valid rows found. Format: Name,RegNo" })); return; }
      const r = await apiRequest(`/api/courses/${courseId}/students/bulk`, { method: "POST", body: JSON.stringify({ students: parsed }) });
      setCsvStatus(p => ({ ...p, [courseId]: `✅ Added ${r.added} students (${r.skipped} skipped)` }));
      loadStudents(courseId);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function triggerEnroll(courseId: string, studentId: string, studentName: string) {
    const deviceId = selectedDevice || devices[0]?.id;
    if (!deviceId) return alert("Select a device first.");
    await apiRequest(`/api/devices/${deviceId}/enroll`, { method: "POST", body: JSON.stringify({ student_id: studentId }) });
    setEnrollTarget({ courseId, studentId, studentName });
    setTimeout(() => setEnrollTarget(null), 8000);
  }

  async function downloadReport(course: Course) {
    const r = await apiRequest(`/api/courses/${course.id}/report`);
    generatePDF(course, r.students);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your course units, students, and attendance.</p>
        </div>
        <div className="flex gap-2">
          {devices.length > 1 && (
            <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
              className="rounded-md border border-border/60 bg-background/50 px-3 py-1 text-xs">
              {devices.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
            </select>
          )}
          <Button size="sm" onClick={() => setShowAddCourse(v => !v)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Course
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ADD COURSE FORM */}
      {showAddCourse && (
        <Card className="border-sky-500/40">
          <CardHeader><CardTitle className="text-base">New Course Unit</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-4" onSubmit={addCourse}>
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="code">Code</Label>
                <Input id="code" placeholder="CS101" value={newCourse.code} onChange={e => setNewCourse(p => ({ ...p, code: e.target.value }))} required />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cname">Course Name</Label>
                <Input id="cname" placeholder="Introduction to Programming" value={newCourse.name} onChange={e => setNewCourse(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="classes">Total Classes</Label>
                <Input id="classes" type="number" value={newCourse.total_classes} onChange={e => setNewCourse(p => ({ ...p, total_classes: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pass">Pass % Required</Label>
                <Input id="pass" type="number" value={newCourse.pass_criteria} onChange={e => setNewCourse(p => ({ ...p, pass_criteria: e.target.value }))} />
              </div>
              <div className="flex gap-2 sm:col-span-4">
                <Button type="submit" size="sm">Save Course</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddCourse(false)}><X className="h-4 w-4" /></Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ENROLL TOAST */}
      {enrollTarget && (
        <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
          📡 Enrollment command sent to device for <strong>{enrollTarget.studentName}</strong>. Have them place their finger on the scanner within 30 seconds.
        </div>
      )}

      {/* COURSES LIST */}
      {loading ? <p className="text-sm text-muted-foreground">Loading courses...</p> : courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No courses yet. Add your first course above.</p>
      ) : courses.map(course => {
        const isOpen = expanded === course.id;
        const session = activeSessions[course.id];
        const courseStudents = students[course.id] || [];

        return (
          <Card key={course.id} className={session ? "border-emerald-500/50" : ""}>
            <CardHeader className="cursor-pointer" onClick={() => toggleExpand(course.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <CardTitle className="text-base">{course.code} — {course.name}</CardTitle>
                    <CardDescription>
                      {course.total_classes ?? 42} classes · {course.pass_criteria ?? 75}% required
                      {session && <span className="ml-3 text-emerald-400 font-medium">● Session Active</span>}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {!session ? (
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => startSession(course.id)}>
                      <PlayCircle className="h-3 w-3" /> Start Session
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => stopSession(course.id)}>
                      <StopCircle className="h-3 w-3" /> Stop Session
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadReport(course)}>
                    <FileDown className="h-3 w-3" /> PDF Report
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isOpen && (
              <CardContent className="border-t border-border/40 pt-4 space-y-4">
                {/* CSV Upload */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-medium hover:bg-secondary/60 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    Import CSV (Name,RegNo)
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={e => handleCSVUpload(course.id, e)} />
                  </label>
                  {csvStatus[course.id] && <span className="text-xs text-muted-foreground">{csvStatus[course.id]}</span>}
                </div>

                {/* Students Table */}
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">Reg No.</th>
                        <th className="px-3 py-2 text-center">Attended</th>
                        <th className="px-3 py-2 text-center">%</th>
                        <th className="px-3 py-2 text-center">Fingerprint</th>
                        <th className="px-3 py-2 text-center">Enroll FP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courseStudents.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">No students yet. Import a CSV or add manually.</td></tr>
                      ) : courseStudents.map(s => {
                        const pct = s.total_sessions > 0 ? Math.round((s.classes_attended / s.total_sessions) * 100) : 0;
                        const passed = pct >= (course.pass_criteria ?? 75);
                        return (
                          <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                            <td className="px-3 py-2 font-medium">{s.name}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{s.student_id || "—"}</td>
                            <td className="px-3 py-2 text-center text-xs">{s.classes_attended}/{s.total_sessions}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={passed ? "default" : "destructive"} className="text-xs">{pct}%</Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.has_fingerprint > 0
                                ? <span className="text-emerald-400 text-xs">✓ Registered</span>
                                : <span className="text-rose-400 text-xs">Not registered</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => triggerEnroll(course.id, s.id, s.name)}>
                                <Fingerprint className="h-3 w-3" /> Enroll
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  <GraduationCap className="inline h-3 w-3 mr-1" />{courseStudents.length} student{courseStudents.length !== 1 ? "s" : ""} enrolled
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
