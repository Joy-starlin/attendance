import React from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, Plus, FileDown, Upload, PlayCircle,
  StopCircle, Fingerprint, ChevronDown, ChevronRight, RefreshCw, X, Edit3, Trash2, MoreHorizontal
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
  win.document.write(`<html><head><title>Report — ${course.name}</title></head><body><h1>Bugema Attendance Report</h1><p>Course: ${course.code} - ${course.name}</p><table><thead><tr><th>#</th><th>Name</th><th>Reg No.</th><th>Attended</th><th>%</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close();
}

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
  const [editingCourse, setEditingCourse] = React.useState<Course | null>(null);
  const [csvStatus, setCsvStatus] = React.useState<Record<string, string>>({});
  const [showAddStudent, setShowAddStudent] = React.useState<string | null>(null);
  const [manualStudent, setManualStudent] = React.useState({ name: "", student_id: "" });
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

  async function updateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCourse) return;
    await apiRequest(`/api/courses/${editingCourse.id}`, { method: "PUT", body: JSON.stringify(editingCourse) });
    setEditingCourse(null);
    load();
  }

  async function deleteCourse(id: string) {
    if (!confirm("Are you sure?")) return;
    await apiRequest(`/api/courses/${id}`, { method: "DELETE" });
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
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const parsed = parseCSV(ev.target?.result as string);
      const r = await apiRequest(`/api/courses/${courseId}/students/bulk`, { method: "POST", body: JSON.stringify({ students: parsed }) });
      setCsvStatus(p => ({ ...p, [courseId]: `✅ Added ${r.added} students` }));
      loadStudents(courseId);
    };
    reader.readAsText(file);
  }

  async function unenrollStudent(courseId: string, studentId: string) {
    if (!confirm("Remove student?")) return;
    await apiRequest(`/api/courses/${courseId}/students/${studentId}`, { method: "DELETE" });
    loadStudents(courseId);
  }

  async function enrollSingleStudent(courseId: string) {
    if (!manualStudent.name || !manualStudent.student_id) return;
    await apiRequest(`/api/courses/${courseId}/students`, { method: "POST", body: JSON.stringify(manualStudent) });
    setManualStudent({ name: "", student_id: "" });
    setShowAddStudent(null);
    loadStudents(courseId);
  }

  async function triggerEnroll(courseId: string, studentId: string, studentName: string) {
    const deviceId = selectedDevice || devices[0]?.id;
    if (!deviceId) return alert("No device selected.");
    await apiRequest(`/api/devices/${deviceId}/enroll`, { method: "POST", body: JSON.stringify({ student_id: studentId }) });
    setEnrollTarget({ courseId, studentId, studentName });
    setTimeout(() => setEnrollTarget(null), 8000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your course units and students.</p>
        </div>
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
              className="rounded-md border border-border/60 bg-background/50 px-3 py-1.5 text-xs h-9 overflow-hidden max-w-[120px]">
              {devices.map(d => <option key={d.id} value={d.id}>{d.id.slice(-6)}</option>)}
            </select>
          )}
          <Button size="sm" onClick={() => setShowAddCourse(v => !v)} className="h-9 gap-2">
            <Plus className="h-4 w-4" /> <span className="hidden xs:inline">Add Course</span>
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Forms Grid Fix */}
      {showAddCourse && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm">New Course Unit</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 grid-cols-1 sm:grid-cols-4" onSubmit={addCourse}>
              <div className="space-y-1 sm:col-span-1">
                <Label htmlFor="code" className="text-xs">Code</Label>
                <Input id="code" className="h-8 text-xs" placeholder="CS101" value={newCourse.code} onChange={e => setNewCourse(p => ({ ...p, code: e.target.value }))} required />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cname" className="text-xs">Course Name</Label>
                <Input id="cname" className="h-8 text-xs" placeholder="Course Name" value={newCourse.name} onChange={e => setNewCourse(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-1">
                <div className="space-y-1">
                  <Label htmlFor="classes" className="text-[10px]">Classes</Label>
                  <Input id="classes" type="number" className="h-8 text-xs px-2" value={newCourse.total_classes} onChange={e => setNewCourse(p => ({ ...p, total_classes: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pass" className="text-[10px]">Pass %</Label>
                  <Input id="pass" type="number" className="h-8 text-xs px-2" value={newCourse.pass_criteria} onChange={e => setNewCourse(p => ({ ...p, pass_criteria: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-4 pt-1">
                <Button type="submit" size="sm" className="h-8 text-xs px-4">Save Course</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowAddCourse(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Edit Form - Similar Fix */}
      {editingCourse && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Edit Course</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 grid-cols-1 sm:grid-cols-4" onSubmit={updateCourse}>
               <div className="space-y-1 sm:col-span-1"><Label className="text-xs text-muted-foreground">Code</Label><Input className="h-8 text-xs" value={editingCourse.code} onChange={e => setEditingCourse({...editingCourse, code: e.target.value})} /></div>
               <div className="space-y-1 sm:col-span-2"><Label className="text-xs text-muted-foreground">Name</Label><Input className="h-8 text-xs" value={editingCourse.name} onChange={e => setEditingCourse({...editingCourse, name: e.target.value})} /></div>
               <div className="grid grid-cols-2 gap-2 sm:col-span-1">
                 <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Total</Label><Input className="h-8 text-xs" type="number" value={editingCourse.total_classes} onChange={e => setEditingCourse({...editingCourse, total_classes: +e.target.value})} /></div>
                 <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Pass%</Label><Input className="h-8 text-xs" type="number" value={editingCourse.pass_criteria} onChange={e => setEditingCourse({...editingCourse, pass_criteria: +e.target.value})} /></div>
               </div>
               <div className="flex gap-2 sm:col-span-4 pt-1">
                <Button type="submit" size="sm" className="h-8 text-xs">Update</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingCourse(null)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Course Cards Responsive */}
      <div className="grid gap-4">
        {courses.map(course => {
          const isOpen = expanded === course.id;
          const session = activeSessions[course.id];
          const courseStudents = students[course.id] || [];

          return (
            <Card key={course.id} className={cn("gradient-border-card", session ? "active-session-pulse border-emerald-500/40" : "")}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(course.id)}>
                    {isOpen ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <h3 className="font-semibold text-foreground">{course.code}</h3>
                      <p className="text-xs text-muted-foreground">{course.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!session ? (
                      <Button size="sm" className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-[11px]" onClick={() => startSession(course.id)}>
                        <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Start Session
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" className="h-8 px-3 text-[11px]" onClick={() => stopSession(course.id)}>
                        <StopCircle className="mr-1.5 h-3.5 w-3.5" /> Stop Session
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 px-3 text-[11px]" onClick={() => downloadReport(course)}>
                      <FileDown className="mr-1.5 h-3.5 w-3.5" /> Report
                    </Button>
                    <div className="flex gap-1 ml-1 pl-1 border-l border-border/40">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingCourse(course)}><Edit3 className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => deleteCourse(course.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-5 space-y-5 border-t border-border/40 pt-5 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <Button size="sm" variant="secondary" className="h-8 text-xs w-full sm:w-auto" onClick={() => setShowAddStudent(showAddStudent === course.id ? null : course.id)}>
                         <Plus className="mr-2 h-3.5 w-3.5" /> Enroll Student
                      </Button>
                      <label className="flex h-8 items-center justify-center gap-2 rounded-md border border-border/60 bg-secondary/20 px-4 text-xs font-medium cursor-pointer hover:bg-secondary/40 w-full sm:w-auto">
                        <Upload className="h-3.5 w-3.5" /> Import to Course (CSV)
                        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleCSVUpload(course.id, e)} />
                      </label>
                      {csvStatus[course.id] && <span className="text-[10px] text-primary italic">{csvStatus[course.id]}</span>}
                    </div>

                    {showAddStudent === course.id && (
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-lg bg-card/40 p-3 border border-border">
                        <div className="w-full sm:flex-1"><Label className="text-[10px] text-muted-foreground">Full Name</Label><Input className="h-8 text-xs" value={manualStudent.name} onChange={e => setManualStudent({...manualStudent, name:e.target.value})} /></div>
                        <div className="w-full sm:w-48"><Label className="text-[10px] text-muted-foreground">Reg No.</Label><Input className="h-8 text-xs font-mono" value={manualStudent.student_id} onChange={e => setManualStudent({...manualStudent, student_id:e.target.value})} /></div>
                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                          <Button size="sm" className="h-8" onClick={() => enrollSingleStudent(course.id)}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowAddStudent(null)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <table className="w-full text-sm">
                        <thead className="bg-background/50 text-[10px] uppercase text-muted-foreground font-bold border-b border-border/60">
                          <tr>
                            <th className="px-3 py-2 text-left">Student</th>
                            <th className="px-3 py-2 text-left">Reg No.</th>
                            <th className="px-3 py-2 text-center">%</th>
                            <th className="px-3 py-2 text-center">Fp</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {courseStudents.map(s => {
                            const pct = s.total_sessions > 0 ? Math.round((s.classes_attended / s.total_sessions) * 100) : 0;
                            return (
                              <tr key={s.id} className="hover:bg-secondary/30">
                                <td className="px-3 py-2 whitespace-nowrap"><div className="font-medium text-foreground">{s.name}</div></td>
                                <td className="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">{s.student_id || "-"}</td>
                                <td className="px-3 py-2 text-center text-xs">{pct}%</td>
                                <td className="px-3 py-2 text-center">
                                  <div className={cn("h-2 w-2 rounded-full mx-auto", s.has_fingerprint ? "bg-emerald-500" : "bg-muted")} />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => triggerEnroll(course.id, s.id, s.name)}><Fingerprint className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => unenrollStudent(course.id, s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
