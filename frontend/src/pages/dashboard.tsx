import React from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRole } from "@/lib/format";
import { GraduationCap, Users, Cpu, PlayCircle } from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<{
    courses: number;
    students: number;
    devices: number;
  }>({ courses: 0, students: 0, devices: 0 });

  React.useEffect(() => {
    async function load() {
      try {
        const [courses, students, devices] = await Promise.all([
          api.courses().catch(() => []),
          api.students().catch(() => []),
          api.devices().catch(() => []),
        ]);
        setStats({
          courses: courses.length,
          students: students.length,
          devices: devices.length,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Attendance intelligence
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor biometric sessions, student coverage, and device health at a glance.
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          Signed in as <span className="mx-1 font-semibold">{formatRole(user?.role || "")}</span>
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Courses</CardTitle>
            <GraduationCap className="h-4 w-4 text-sky-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "—" : stats.courses.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Teaching units configured in MySQL.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <Users className="h-4 w-4 text-emerald-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "—" : stats.students.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active profiles with attendance records.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Devices</CardTitle>
            <Cpu className="h-4 w-4 text-violet-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {loading ? "—" : stats.devices.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ESP32 biometric units connected to campus.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        <Card className="gradient-border-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>
                Start a live session and track attendance in real time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-4">
            <Button size="lg" className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Start attendance session
            </Button>
            <Button variant="outline" size="sm">
              View courses
            </Button>
            <Button variant="outline" size="sm">
              View students
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Realtime signal</CardTitle>
            <CardDescription>
              WebSocket events stream from ESP32 devices into this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              When a student taps a fingerprint, the event is written to MySQL and
              pushed to this console over WebSockets so you can monitor attendance as it
              happens.
            </p>
            <p>
              The UI stays responsive even under load, with minimal visual noise and
              clear typography for lecture halls and control rooms.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

