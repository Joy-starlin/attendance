import React from "react";
import { Link } from "react-router-dom";
import { api, ApiError, Student } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, RefreshCw, Search, Upload, Fingerprint, FileDown, Plus, X, Edit3, Trash2 } from "lucide-react";

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
    if (!devId) return alert("Select a device first.");
    try {
      await apiRequest(`/api/devices/${devId}/enroll`, { method: "POST", body: JSON.stringify({ student_id: studentId }) });
      setEnrollTarget({ id: studentId, name: studentName });
      setTimeout(() => setEnrollTarget(null), 15000);
    } catch (err: any) { alert(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete student? This removes all their attendance and fingerprints permanently.")) return;
    try {
      await apiRequest(`/api/students/${id}`, { method: "DELETE" });
      load();
    } catch (err: any) { alert(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Student Management</h1>
          <p className="mt-1 text-sm text-slate-400">View, edit, and manage registered student profiles.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button onClick={() => setShowRegisterModal(true)} className="bg-sky-600 hover:bg-sky-500">
             <Plus className="mr-2 h-4 w-4" /> New Student
           </Button>
           <Button variant="outline" onClick={load} disabled={loading} size="icon"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="gradient-border-card bg-slate-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
           <div className="flex-1 max-w-sm">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
               <Input className="pl-9 h-9 bg-slate-950/50" placeholder="Search by name or reg no..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
             </div>
           </div>
           <div className="flex gap-2 ml-4">
             <Button variant="secondary" size="sm" onClick={() => generateStudentsPDF(filteredStudents)}><FileDown className="mr-2 h-4 w-4" />Export</Button>
             <label className="flex items-center gap-2 cursor-pointer bg-slate-950/50 border border-slate-800 rounded-md px-3 py-1 text-xs hover:bg-slate-800 transition-colors">
                <Upload className="h-3.5 w-3.5" /> CSV Import
                <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const parsed = parseCSV(ev.target?.result as string);
                    setCsvStatus("Uploading...");
                    await apiRequest("/api/students/bulk", { method: "POST", body: JSON.stringify({ students: parsed }) });
                    setCsvStatus("✅ Done!"); load(); setTimeout(() => setCsvStatus(""), 3000);
                  };
                  reader.readAsText(file);
                }} />
             </label>
           </div>
        </CardHeader>
        <CardContent>
           {csvStatus && <div className="text-[10px] text-sky-400 mb-2 italic px-2">{csvStatus}</div>}
           <div className="overflow-x-auto rounded-lg border border-slate-800">
             <table className="w-full text-sm">
               <thead className="bg-slate-950/50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-800">
                 <tr>
                   <th className="px-4 py-3 text-left">Reg No.</th>
                   <th className="px-4 py-3 text-left">Name</th>
                   <th className="px-4 py-3 text-left">Year</th>
                   <th className="px-4 py-3 text-left">Biometrics</th>
                   <th className="px-4 py-3 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800">
                 {filteredStudents.map(s => (
                   <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                     <td className="px-4 py-3 text-xs font-mono text-sky-400">{s.student_id || "—"}</td>
                     <td className="px-4 py-3">
                       <div className="font-medium text-slate-200">{s.name}</div>
                       <div className="text-[10px] text-slate-500">{s.email}</div>
                     </td>
                     <td className="px-4 py-3 text-xs">Year {s.year_of_study || 1}</td>
                     <td className="px-4 py-3">
                       <Badge variant={s.has_fingerprint ? "default" : "outline"} className={s.has_fingerprint ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "text-slate-500"}>
                         {s.has_fingerprint ? "Registered" : "Pending"}
                       </Badge>
                     </td>
                     <td className="px-4 py-3 text-right">
                       <div className="flex justify-end gap-1">
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-400" title="Enroll Fingerprint" onClick={() => handleLiveEnroll(s.id, s.name)}>
                           <Fingerprint className="h-4 w-4" />
                         </Button>
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" title="Edit Profile" onClick={() => setEditingStudent(s)}>
                           <Edit3 className="h-4 w-4" />
                         </Button>
                         <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" title="Delete Student" onClick={() => handleDelete(s.id)}>
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </CardContent>
      </Card>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-slate-700 shadow-2xl">
            <CardHeader className="border-b border-slate-800"><CardTitle>Register Student</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault(); setRegistering(true);
              try {
                await api.register({ ...formData, role: "student", password: formData.student_id });
                setShowRegisterModal(false); load(); setFormData({ name: "", email: "", student_id: "", year_of_study: 1 });
              } catch (err: any) { alert(err.message); } finally { setRegistering(false); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-[10px]">Name</Label><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label className="text-[10px]">Reg No.</Label><Input required value={formData.student_id} onChange={e => setFormData({...formData, student_id: e.target.value})} /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Year</Label><Input required type="number" value={formData.year_of_study} onChange={e => setFormData({...formData, year_of_study: parseInt(e.target.value)})} /></div>
                </div>
              </CardContent>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
                <Button variant="ghost" size="sm" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
                <Button size="sm" type="submit" disabled={registering}>{registering ? "Saving..." : "Save Record"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-sky-500/30">
            <CardHeader className="border-b border-slate-800"><CardTitle>Edit Profile</CardTitle></CardHeader>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiRequest(`/api/students/${editingStudent.id}`, { method: "PUT", body: JSON.stringify(editingStudent) });
                setEditingStudent(null); load();
              } catch (err: any) { alert(err.message); }
            }}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1"><Label className="text-[10px]">Name</Label><Input value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1"><Label className="text-[10px]">Reg No.</Label><Input value={editingStudent.student_id} onChange={e => setEditingStudent({...editingStudent, student_id: e.target.value})} /></div>
                  <div className="space-y-1"><Label className="text-[10px]">Year</Label><Input type="number" value={editingStudent.year_of_study} onChange={e => setEditingStudent({...editingStudent, year_of_study: parseInt(e.target.value)})} /></div>
                </div>
                <div className="space-y-1"><Label className="text-[10px]">Email</Label><Input value={editingStudent.email} onChange={e => setEditingStudent({...editingStudent, email: e.target.value})} /></div>
              </CardContent>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
                <Button variant="ghost" size="sm" onClick={() => setEditingStudent(null)}>Cancel</Button>
                <Button size="sm" type="submit" className="bg-sky-600">Save Changes</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
