import React from "react";
import { Link } from "react-router-dom";
import { api, ApiError, Student } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, RefreshCw, Search, Upload, Fingerprint, FileDown, Plus, X, Edit3, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";

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
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  
  // Check if first line is header (contains 'name' or 'student')
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('name') || firstLine.includes('student');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  
  return dataLines.map(l => {
    // Handle quoted values and trim whitespace
    const cols = l.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    const [name, student_id] = cols;
    return { name, student_id };
  }).filter(r => r.name && r.student_id);
}

function generateStudentsPDF(students: any[]) {
  const win = window.open("", "_blank")!;
  const rows = students.map((s) => `
    <tr>
      <td>${s.name}</td>
      <td style="font-family:monospace">${s.student_id}</td>
      <td style="text-align:center;font-weight:600;color:${s.has_fingerprint ? '#16a34a' : '#e11d48'}">${s.has_fingerprint ? 'YES' : 'NO'}</td>
    </tr>
  `).join("");
  win.document.write(`<html><head><title>Student Directory</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; margin: 0; color: #0f172a; background: #fff; }
    h1 { font-size: 1.25rem; margin-top: 0; margin-bottom: 16px; color: #0033a0; }
    .table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px; }
    table { width: 100%; min-width: 400px; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #f8fafc; padding: 12px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; color: #475569; }
    td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) { background: #f8fafc; }
    .actions { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
    button { padding: 6px 12px; font-size: 0.75rem; cursor: pointer; border: none; border-radius: 4px; font-weight: 600; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .btn-print { background: #0033a0; }
    .btn-save { background: #16a34a; }
    .btn-close { background: #475569; margin-left: auto; }
    @media print { .no-print { display: none !important; } body { padding: 0 !important; } .table-responsive { overflow-x: visible !important; } }
  </style>
  </head><body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">Print</button>
    <button class="btn-save" onclick="window.print()">Save PDF</button>
    <button class="btn-close" onclick="window.close()">Exit</button>
  </div>
  <h1>Bugema University — Student Directory</h1>
  <div class="table-responsive">
    <table>
      <thead><tr><th>Name</th><th>Reg No.</th><th style="text-align:center">Enrolled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  </body></html>`);
  win.document.close();
}

export function StudentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showRegisterModal, setShowRegisterModal] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<Student | null>(null);
  const [registering, setRegistering] = React.useState(false);
  const [formData, setFormData] = React.useState({ name: "", student_id: "", year_of_study: 1 });
  const [csvStatus, setCsvStatus] = React.useState("");
  const [enrollTarget, setEnrollTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [devices, setDevices] = React.useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [toastMsg, setToastMsg] = React.useState<{text: string, type: 'success'|'error'} | null>(null);

  const showToast = React.useCallback((text: string, type: 'success'|'error') => {
    setToastMsg({text, type});
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const filteredStudents = React.useMemo(() => {
    return students.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.student_id?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [students, searchQuery]);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [sData, dData] = await Promise.all([api.students(), api.devices().catch(() => [])]);
      setStudents(sData);
      setDevices(dData);
      if (dData.length > 0 && !selectedDevice) setSelectedDevice(dData[0].id);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [selectedDevice]);

  React.useEffect(() => { load(); }, [load]);

  async function handleLiveEnroll(studentId: string, studentName: string) {
    const devId = selectedDevice || devices[0]?.id;
    if (!devId) return showToast("Select a device first.", "error");
    try {
      await apiRequest(`/api/devices/${devId}/enroll`, { method: "POST", body: JSON.stringify({ student_id: studentId }) });
      setEnrollTarget({ id: studentId, name: studentName });
      showToast(`Enrollment started for ${studentName}. Place finger on sensor...`, "success");
      
      // Poll for enrollment completion (check if fingerprint appears)
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const student = await api.student(studentId);
          if (student.has_fingerprint) {
            clearInterval(pollInterval);
            setEnrollTarget(null);
            showToast(`${studentName} enrolled successfully!`, "success");
            load(); // Refresh student list
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setEnrollTarget(null);
            showToast(`Enrollment timeout for ${studentName}`, "error");
          }
        } catch (e) {
          // Silent fail on poll error
        }
      }, 1000);
    } catch (err: any) { showToast(err.message, "error"); }
  }

  function handleDeleteClick(id: string) {
    setDeletingId(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Student Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">View and manage registered student profiles.</p>
        </div>
        <div className="flex items-center gap-2">
           {devices.length > 0 && (
             <select 
               value={selectedDevice} 
               onChange={(e) => setSelectedDevice(e.target.value)}
               className="h-9 px-3 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
             >
               {devices.map(d => (
                 <option key={d.id} value={d.id}>{d.name || d.id}</option>
               ))}
             </select>
           )}
           <Button onClick={() => setShowRegisterModal(true)} className="bg-primary hover:bg-primary w-full sm:w-auto">
             <Plus className="mr-2 h-4 w-4" /> <span className="hidden xs:inline">New Student</span>
           </Button>
           <Button variant="outline" onClick={load} disabled={loading} size="icon"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="gradient-border-card bg-card/50">
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4">
           <div className="w-full max-w-sm">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input className="pl-9 h-9 bg-background/50 text-xs" placeholder="Search students..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
             </div>
           </div>
           <div className="flex gap-2 w-full md:w-auto">
             <Button variant="secondary" size="sm" className="flex-1 md:flex-none h-9 text-xs" onClick={() => generateStudentsPDF(filteredStudents)}><FileDown className="mr-2 h-4 w-4" />Export</Button>
             <label className="flex flex-1 md:flex-none h-9 items-center justify-center gap-2 cursor-pointer bg-background/50 border border-border rounded-md px-3 text-[11px] hover:bg-secondary transition-colors shrink-0 whitespace-nowrap overflow-hidden">
                <Upload className="h-3.5 w-3.5" /> {csvStatus || "CSV Import"}
                <input type="file" accept=".csv" className="hidden" disabled={!!csvStatus} onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const parsed = parseCSV(ev.target?.result as string);
                    setCsvStatus("Uploading...");
                    try {
                      const res = await apiRequest("/api/students/bulk", { method: "POST", body: JSON.stringify({ students: parsed }) });
                      showToast(`Imported ${res.added} students. Skipped ${res.skipped}.`, "success");
                      load();
                    } catch (err: any) {
                      showToast("Import failed: " + err.message, "error");
                    }
                    setCsvStatus("");
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
             </label>
           </div>
        </CardHeader>
        <CardContent>
           <div className="overflow-x-auto rounded-lg border border-border">
             <table className="w-full text-sm">
               <thead className="bg-background/50 text-[10px] uppercase text-muted-foreground font-bold border-b border-border">
                 <tr>
                   <th className="px-3 py-3 text-left">Reg No.</th>
                   <th className="px-3 py-3 text-left">Name</th>
                   <th className="px-3 py-3 text-left hidden sm:table-cell">Year</th>
                   <th className="px-3 py-3 text-left">Biometrics</th>
                   <th className="px-3 py-3 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                 {filteredStudents.map(s => (
                   <tr key={s.id} className="hover:bg-secondary/30 transition-colors">
                     <td className="px-3 py-3 text-xs font-mono text-primary">{s.student_id ? s.student_id.slice(-8) : "-"}</td>
                     <td className="px-3 py-3">
                       <div className="font-medium text-foreground text-xs sm:text-sm">{s.name}</div>
                     </td>
                     <td className="px-3 py-3 text-xs hidden sm:table-cell">Yr {s.year_of_study || 1}</td>
                     <td className="px-3 py-3">
                       <div className={cn("h-1.5 w-1.5 rounded-full mx-auto", s.has_fingerprint ? "bg-emerald-500" : "bg-muted")} />
                     </td>
                     <td className="px-3 py-3 text-right">
                       <div className="flex justify-end gap-1">
                         {enrollTarget?.id === s.id ? (
                           <span className="flex items-center gap-1 text-xs text-amber-500 animate-pulse">
                             <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enrolling...
                           </span>
                         ) : (
                           <>
                             <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleLiveEnroll(s.id, s.name)}><Fingerprint className="h-3.5 w-3.5" /></Button>
                             <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingStudent(s)}><Edit3 className="h-3.5 w-3.5" /></Button>
                             <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => handleDeleteClick(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                           </>
                         )}
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </CardContent>
      </Card>

      {/* Responsive Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-border bg-card/50"><CardTitle>Register Student</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault(); setRegistering(true);
              try {
                const finalEmail = `${Math.random().toString(36).slice(2)}@student.local`;
                await api.register({ ...formData, email: finalEmail, role: "student", password: formData.student_id });
                setShowRegisterModal(false); load(); setFormData({ name: "", student_id: "", year_of_study: 1 });
                showToast("Student registered successfully", "success");
              } catch (err: any) { showToast(err.message, "error"); } finally { setRegistering(false); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Name</Label><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Reg No.</Label><Input required value={formData.student_id} onChange={e => setFormData({...formData, student_id: e.target.value})} className="h-9 font-mono" /></div>
                   <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Year of Study</Label><Input required type="number" min="1" max="5" value={formData.year_of_study} onChange={e => setFormData({...formData, year_of_study: parseInt(e.target.value)})} className="h-9" /></div>
                </div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-background/20">
                <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
                <Button size="sm" type="submit" disabled={registering} className="bg-primary px-6">{registering ? "..." : "Save Student"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Responsive Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border-primary/30 shadow-2xl animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-border bg-card/50"><CardTitle>Edit Profile</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const finalEditEmail = editingStudent.email || `${Math.random().toString(36).slice(2)}@student.local`;
                await apiRequest(`/api/students/${editingStudent.id}`, { method: "PUT", body: JSON.stringify({...editingStudent, email: finalEditEmail}) });
                setEditingStudent(null); load();
                showToast("Student profile updated successfully", "success");
              } catch (err: any) { showToast(err.message, "error"); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Full Name</Label><Input value={editingStudent.name || ""} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Reg No.</Label><Input value={editingStudent.student_id || ""} onChange={e => setEditingStudent({...editingStudent, student_id: e.target.value})} className="h-9 font-mono" /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase">Year</Label><Input type="number" value={editingStudent.year_of_study || 1} onChange={e => setEditingStudent({...editingStudent, year_of_study: parseInt(e.target.value)})} className="h-9" /></div>
                </div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-background/20">
                <Button variant="ghost" size="sm" onClick={() => setEditingStudent(null)}>Cancel</Button>
                <Button size="sm" type="submit" className="bg-primary px-6">Update</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Responsive Delete Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border-rose-500/30 shadow-2xl animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-border bg-card/50">
              <CardTitle className="text-rose-500 text-lg">Delete Student</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-foreground/80">
              Are you sure you want to delete this student? This action cannot be undone and will remove all their attendance and biometric data.
            </CardContent>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-background/20">
              <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={async () => {
                try {
                  await apiRequest(`/api/students/${deletingId}`, { method: "DELETE" });
                  setDeletingId(null); load(); showToast("Student deleted successfully", "success");
                } catch (err: any) { showToast(err.message, "error"); setDeletingId(null); }
              }}>Yes, delete</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast Warning/Success */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-[70] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={cn("flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium", 
            toastMsg.type === 'success' ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-500" : "bg-rose-950/90 border-rose-500/50 text-rose-500"
          )}>
            {toastMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toastMsg.text}
          </div>
        </div>
      )}
    </div>
  );
}
