import React from "react";
import { Link } from "react-router-dom";
import { api, ApiError, Student } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, RefreshCw, Search, Upload, Fingerprint, FileDown, Plus, X } from "lucide-react";

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
    return { name, student_id, email: email || `${student_id.replace(/\//g, '')}@bugema.ac.ug` };
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
  
  win.document.write(`
    <html>
      <head>
        <title>Student Directory</title>
        <style>
          body{font-family:sans-serif;padding:40px;color:#333}
          h1{font-size:24px;margin-bottom:20px;color:#1e3a5f}
          table{width:100%;border-collapse:collapse;margin-top:20px}
          th{background:#1e3a5f;color:#fff;text-align:left;padding:10px;font-size:14px}
          td{padding:10px;border-bottom:1px solid #eee;font-size:13px}
          .footer{font-size:10px;margin-top:40px;color:#999;border-top:1px solid #eee;padding-top:10px}
        </style>
      </head>
      <body>
        <h1>Bugema University — Student Directory</h1>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Reg No.</th>
              <th>Email</th>
              <th>Enrolled</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Generated on ${new Date().toLocaleString()}</div>
      </body>
    </html>
  `);
  win.document.close();
}

export function StudentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showRegisterModal, setShowRegisterModal] = React.useState(false);
  const [registering, setRegistering] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    student_id: "",
    year_of_study: 1,
  });

  const [csvStatus, setCsvStatus] = React.useState("");
  const [enrollTarget, setEnrollTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [devices, setDevices] = React.useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = React.useState("");

  const filteredStudents = React.useMemo(() => {
    return students.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.student_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.year_of_study?.toString().includes(searchQuery)
    );
  }, [students, searchQuery]);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [sData, dData] = await Promise.all([
        api.students(),
        api.devices().catch(() => [])
      ]);
      setStudents(sData);
      setDevices(dData);
      if (dData.length > 0 && !selectedDevice) setSelectedDevice(dData[0].id);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to load students. Check the API and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleLiveEnroll(studentId: string, studentName: string) {
    const devId = selectedDevice || devices[0]?.id;
    if (!devId) {
      alert("No biometric device found. Please ensure your ESP32 is online.");
      return;
    }
    try {
      await apiRequest(`/api/devices/${devId}/enroll`, { 
        method: "POST", 
        body: JSON.stringify({ student_id: studentId }) 
      });
      setEnrollTarget({ id: studentId, name: studentName });
      setTimeout(() => setEnrollTarget(null), 15000);
    } catch (err: any) {
      alert(err.message || "Failed to trigger enrollment");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Student Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage student profiles, import batch data, and register fingerprints.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-80 border border-border/60 rounded-md bg-background/50 focus-within:ring-1 focus-within:ring-sky-500">
          <Search className="ml-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-0 bg-transparent focus-visible:ring-0 shadow-none"
          />
          <Button variant="ghost" size="icon" className="mr-1 rounded-sm text-muted-foreground" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => setShowRegisterModal(true)} className="bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/20">
          <Plus className="mr-2 h-4 w-4" />
          New Student
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      {enrollTarget && (
        <div className="flex items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200 animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
          <span className="flex-1">
            📡 <strong>Terminal Enrollment</strong>: Link initiated for <strong>{enrollTarget.name}</strong>. 
            Have the student scan their finger on the terminal now.
          </span>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-sky-400 hover:text-sky-300" onClick={() => setEnrollTarget(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Card className="gradient-border-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Directory</CardTitle>
            <CardDescription>
              {loading ? "Syncing..." : `${filteredStudents.length} student record(s) listed`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs font-medium hover:bg-secondary/60 transition-all duration-200">
               <Upload className="h-3.5 w-3.5" />
               Bulk Import (CSV)
               <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                 const file = e.target.files?.[0];
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = async (ev) => {
                   try {
                     const parsed = parseCSV(ev.target?.result as string);
                     setCsvStatus(`Uploading ${parsed.length} students...`);
                     await apiRequest("/api/students/bulk", { method: "POST", body: JSON.stringify({ students: parsed }) });
                     setCsvStatus(`✅ Import complete!`);
                     load();
                     setTimeout(() => setCsvStatus(""), 4000);
                   } catch (err: any) {
                     setCsvStatus(`❌ Error: ${err.message}`);
                   }
                 };
                 reader.readAsText(file);
               }} />
            </label>
            <Button variant="outline" size="sm" onClick={() => generateStudentsPDF(filteredStudents)}>
               <FileDown className="mr-2 h-4 w-4" />
               Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {csvStatus && <div className="mb-4 text-xs p-2 bg-secondary/30 border border-border/40 rounded italic text-sky-200">{csvStatus}</div>}
          
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/40">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">Reg No.</th>
                  <th className="px-4 py-3 text-left">Full Name</th>
                  <th className="px-4 py-3 text-left">Year</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Biometric Action</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && !loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">No students found. Add one or upload a CSV to begin.</td></tr>
                ) : (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-sky-300">{s.student_id || "—"}</td>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">Year {s.year_of_study || 1}</td>
                      <td className="px-4 py-3">
                        <Badge variant={s.has_fingerprint ? "default" : "outline"} className={s.has_fingerprint ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : ""}>
                          {s.has_fingerprint ? "Registered" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 gap-2 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                            onClick={() => handleLiveEnroll(s.id, s.name)}
                          >
                            <Fingerprint className="h-3.5 w-3.5" />
                            Enroll Finger
                          </Button>
                          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                            <Link to={`/students/${s.id}`}>Profile</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200">
            <Card className="border-border/80 shadow-2xl">
              <CardHeader>
                <CardTitle>Add New Student</CardTitle>
                <CardDescription>Manually create a student record.</CardDescription>
              </CardHeader>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setRegistering(true);
                try {
                  await api.register({ ...formData, role: "student", password: "changeme123" });
                  setShowRegisterModal(false);
                  load();
                  setFormData({ name: "", email: "", student_id: "", year_of_study: 1 });
                } catch (err: any) {
                  alert(err.message || "Failed to add student");
                } finally {
                  setRegistering(false);
                }
              }}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Full Name</label>
                    <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase">Reg No.</label>
                      <Input required placeholder="24/BSE/..." value={formData.student_id} onChange={e => setFormData({...formData, student_id: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase">Year</label>
                      <Input required type="number" value={formData.year_of_study} onChange={e => setFormData({...formData, year_of_study: parseInt(e.target.value)})} />
                    </div>
                  </div>
                </CardContent>
                <div className="flex justify-end gap-3 p-6 pt-0">
                  <Button type="button" variant="ghost" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={registering} className="bg-sky-600 hover:bg-sky-500 text-white">
                    {registering ? "Saving..." : "Save Record"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
