import React from "react";
import { Link } from "react-router-dom";
import { api, ApiError, Student } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, RefreshCw, Search, Upload, Fingerprint, FileDown, Plus, X, Edit3, Trash2, CheckCircle, XCircle } from "lucide-react";

async function apiRequest(path: string, init?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.json();
}

function parseCSV(text: string): { name: string; student_id: string; email?: string }[] {
  const lines = text.trim().split(/\r?\n/);
  return lines.slice(1).map(l => {
    const [name, student_id, email] = l.split(",").map(s => s.trim());
    return { name, student_id, email: email || `${student_id.replace(/\//g, '').toLowerCase()}@bugema.ac.ug` };
  }).filter(r => r.name && r.student_id);
}

function generateStudentsPDF(students: any[]) {
  const win = window.open("", "_blank")!;
  const rows = students.map((s, i) => `
    <tr style="background:${i % 2 ? '#f9fafb' : '#fff'}">
      <td style="padding:8px;border-bottom:1px solid #eee">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${s.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${s.student_id}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${s.email || '-'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${s.has_fingerprint ? 'YES' : 'NO'}</td>
    </tr>
  `).join("");
  win.document.write(`<html><head><title>Student Directory</title></head><body><h1>Bugema Attendance — Student Directory</h1><table style="width:100%;border-collapse:collapse"><thead><tr><th>#</th><th>Name</th><th>Reg No.</th><th>Email</th><th>Enrolled</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
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
  const [formData, setFormData] = React.useState({ name: "", email: "", student_id: "", year_of_study: 1 });
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
      showToast(`Enrollment started for ${studentName}`, "success");
      setTimeout(() => setEnrollTarget(null), 15000);
    } catch (err: any) { showToast(err.message, "error"); }
  }

  function handleDeleteClick(id: string) {
    setDeletingId(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Student Management</h1>
          <p className="mt-1 text-sm text-slate-400">View and manage registered student profiles.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button onClick={() => setShowRegisterModal(true)} className="bg-sky-600 hover:bg-sky-500 w-full sm:w-auto">
             <Plus className="mr-2 h-4 w-4" /> <span className="hidden xs:inline">New Student</span>
           </Button>
           <Button variant="outline" onClick={load} disabled={loading} size="icon"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="gradient-border-card bg-slate-900/50">
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4">
           <div className="w-full max-w-sm">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
               <Input className="pl-9 h-9 bg-slate-950/50 text-xs" placeholder="Search students..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
             </div>
           </div>
           <div className="flex gap-2 w-full md:w-auto">
             <Button variant="secondary" size="sm" className="flex-1 md:flex-none h-9 text-xs" onClick={() => generateStudentsPDF(filteredStudents)}><FileDown className="mr-2 h-4 w-4" />Export</Button>
             <label className="flex flex-1 md:flex-none h-9 items-center justify-center gap-2 cursor-pointer bg-slate-950/50 border border-slate-800 rounded-md px-3 text-[11px] hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap overflow-hidden">
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
           <div className="overflow-x-auto rounded-lg border border-slate-800">
             <table className="w-full text-sm">
               <thead className="bg-slate-950/50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-800">
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
                   <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                     <td className="px-3 py-3 text-xs font-mono text-sky-400">{s.student_id ? s.student_id.slice(-8) : "-"}</td>
                     <td className="px-3 py-3">
                       <div className="font-medium text-slate-200 text-xs sm:text-sm">{s.name}</div>
                       <div className="text-[9px] text-slate-500 hidden xs:block">{s.email}</div>
                     </td>
                     <td className="px-3 py-3 text-xs hidden sm:table-cell">Yr {s.year_of_study || 1}</td>
                     <td className="px-3 py-3">
                       <div className={cn("h-1.5 w-1.5 rounded-full mx-auto", s.has_fingerprint ? "bg-emerald-500" : "bg-slate-700")} />
                     </td>
                     <td className="px-3 py-3 text-right">
                       <div className="flex justify-end gap-1">
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-400" onClick={() => handleLiveEnroll(s.id, s.name)}><Fingerprint className="h-3.5 w-3.5" /></Button>
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setEditingStudent(s)}><Edit3 className="h-3.5 w-3.5" /></Button>
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => handleDeleteClick(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <Card className="w-full max-w-sm border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-slate-800 bg-slate-900/50"><CardTitle>Register Student</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault(); setRegistering(true);
              try {
                const finalEmail = formData.email?.trim() || `${formData.student_id.replace(/\//g, '').toLowerCase()}@bugema.ac.ug`;
                await api.register({ ...formData, email: finalEmail, role: "student", password: formData.student_id });
                setShowRegisterModal(false); load(); setFormData({ name: "", email: "", student_id: "", year_of_study: 1 });
                showToast("Student registered successfully", "success");
              } catch (err: any) { showToast(err.message, "error"); } finally { setRegistering(false); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Name</Label><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Reg No.</Label><Input required value={formData.student_id} onChange={e => setFormData({...formData, student_id: e.target.value})} className="h-9 font-mono" /></div>
                   <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Year of Study</Label><Input required type="number" min="1" max="5" value={formData.year_of_study} onChange={e => setFormData({...formData, year_of_study: parseInt(e.target.value)})} className="h-9" /></div>
                </div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 bg-slate-950/20">
                <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
                <Button size="sm" type="submit" disabled={registering} className="bg-sky-600 px-6">{registering ? "..." : "Save Student"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Responsive Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border-sky-500/30 shadow-2xl animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-slate-800 bg-slate-900/50"><CardTitle>Edit Profile</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const finalEditEmail = editingStudent.email?.trim() || `${(editingStudent.student_id || '').replace(/\//g, "").toLowerCase()}@bugema.ac.ug`;
                await apiRequest(`/api/students/${editingStudent.id}`, { method: "PUT", body: JSON.stringify({...editingStudent, email: finalEditEmail}) });
                setEditingStudent(null); load();
                showToast("Student profile updated successfully", "success");
              } catch (err: any) { showToast(err.message, "error"); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Full Name</Label><Input value={editingStudent.name || ""} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Reg No.</Label><Input value={editingStudent.student_id || ""} onChange={e => setEditingStudent({...editingStudent, student_id: e.target.value})} className="h-9 font-mono" /></div>
                  <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Year</Label><Input type="number" value={editingStudent.year_of_study || 1} onChange={e => setEditingStudent({...editingStudent, year_of_study: parseInt(e.target.value)})} className="h-9" /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs text-slate-400 uppercase">Email Address</Label><Input type="email" value={editingStudent.email || ""} onChange={e => setEditingStudent({...editingStudent, email: e.target.value})} className="h-9" /></div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 bg-slate-950/20">
                <Button variant="ghost" size="sm" onClick={() => setEditingStudent(null)}>Cancel</Button>
                <Button size="sm" type="submit" className="bg-sky-600 px-6">Update</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Responsive Delete Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border-rose-500/30 shadow-2xl animate-in fade-in zoom-in duration-200">
            <CardHeader className="border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-rose-500 text-lg">Delete Student</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-slate-300">
              Are you sure you want to delete this student? This action cannot be undone and will remove all their attendance and biometric data.
            </CardContent>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 bg-slate-950/20">
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
            toastMsg.type === 'success' ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-400" : "bg-rose-950/90 border-rose-500/50 text-rose-400"
          )}>
            {toastMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toastMsg.text}
          </div>
        </div>
      )}
    </div>
  );
}
