import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { GraduationCap, Users, Cpu, PlayCircle, FileText, Fingerprint, Activity } from "lucide-react";

async function fetchLogs() {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/logs", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

async function fetchSemesterReport() {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/reports/semester", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

function generateSemesterPDF(data: any[]) {
  const win = window.open("", "_blank")!;
  const rows = data.map((r) => `
    <tr>
      <td>${r.name}</td>
      <td style="font-family:monospace">${r.reg_no}</td>
      <td>${r.course}</td>
      <td style="text-align:center">${r.attended} / ${r.total}</td>
      <td style="text-align:right;font-weight:bold">${Math.round((r.attended/r.total)*100 || 0)}%</td>
    </tr>
  `).join("");
  win.document.write(`<html><head><title>Semester Report</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; margin: 0; color: #0f172a; background: #fff; }
    h1 { font-size: 1.25rem; margin-top: 0; margin-bottom: 16px; color: #0033a0; }
    .table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px; }
    table { width: 100%; min-width: 500px; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #f8fafc; padding: 12px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; color: #475569; }
    td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) { background: #f8fafc; }
    .actions { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    button { padding: 10px 16px; font-size: 0.875rem; cursor: pointer; border: none; border-radius: 6px; font-weight: 600; color: white; flex: 1; min-width: 140px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .btn-print { background: #0033a0; }
    .btn-close { background: #e11d48; }
    @media print { .no-print { display: none !important; } body { padding: 0 !important; } .table-responsive { overflow-x: visible !important; } }
  </style>
  </head><body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
    <button class="btn-close" onclick="window.close()">Close Report</button>
  </div>
  <h1>Bugema University — Semester Summary</h1>
  <div class="table-responsive">
    <table>
      <thead><tr><th>Name</th><th>Reg No</th><th>Course</th><th style="text-align:center">Sessions</th><th style="text-align:right">%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  </body></html>`);
  win.document.close();
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({ courses: 0, students: 0, devices: 0 });
  const [logs, setLogs] = React.useState<any>({ attendance: [], devices: [] });

  React.useEffect(() => {
    async function load() {
      try {
        const [courses, students, devices, sysLogs] = await Promise.all([
          api.courses().catch(() => []),
          api.students().catch(() => []),
          api.devices().catch(() => []),
          fetchLogs().catch(() => ({ attendance: [], devices: [] }))
        ]);
        setStats({ courses: courses.length, students: students.length, devices: devices.length });
        setLogs(sysLogs);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Faculty Command Center
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Hi, {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.devices > 0 ? `🟢 ${stats.devices} biometric units are live.` : "🔴 No active terminals detected."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-background/50" onClick={async () => {
             const data = await fetchSemesterReport();
             generateSemesterPDF(data);
          }}>
            <FileText className="mr-2 h-4 w-4 text-primary" />
            Semester Report
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => navigate("/students")}>
            <Fingerprint className="mr-2 h-4 w-4" />
            Quick Enroll
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">Courses</CardTitle>
            <GraduationCap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "—" : stats.courses}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Students</CardTitle>
            <Users className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "—" : stats.students}</div>
          </CardContent>
        </Card>
        <Card className="bg-violet-500/5 border-violet-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-violet-500">Terminals</CardTitle>
            <Cpu className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "—" : stats.devices}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          <Card className="gradient-border-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary" />
                Management hub
              </CardTitle>
              <CardDescription>Start teaching sessions or manage your registered devices.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="h-12 px-6 w-full sm:w-auto" onClick={() => navigate("/courses")}>
                Start Attendance Session
              </Button>
              <Button variant="secondary" size="lg" className="h-12 px-6 w-full sm:w-auto" onClick={() => navigate("/students")}>
                Manage Records
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-destructive" />
                Live Terminal Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {logs.attendance.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">Waiting for first scan of the day...</p>
                ) : (
                  logs.attendance.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between rounded-md bg-secondary/20 p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                          <Fingerprint className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">Successful Scan</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{log.status} • Device {log.device_id || 'UNK'}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(log.marked_at)}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recently Seen Devices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {logs.devices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No devices detected yet.</p>
              ) : (
                logs.devices.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <div>
                      <div className="text-xs font-semibold text-foreground">{d.name || d.id}</div>
                      <div className="text-[9px] text-muted-foreground">ID: {d.id}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Badge variant="success" className="h-3 text-[8px] px-1 capitalize">Online</Badge>
                      <div className="mt-1 text-[9px] text-muted-foreground">{formatDateTime(d.last_seen)}</div>
                    </div>
                  </div>
                ))
              )}
              <Button variant="ghost" size="sm" className="w-full mt-2 text-[10px] text-primary" onClick={() => navigate("/devices")}>
                View all devices
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
