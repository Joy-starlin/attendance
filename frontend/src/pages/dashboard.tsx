import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRole } from "@/lib/format";
import { GraduationCap, Users, Cpu, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
            System Overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor biometric sessions, student coverage, and device health at a glance.
          </p>
        </div>
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
              Active teaching units.
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
              Total registered profiles.
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
              Connected biometric units.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        <Card className="gradient-border-card transition-all duration-300 hover:shadow-sky-500/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>
                Start a live session and track attendance in real time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-4">
            <Button size="lg" className="gap-2" onClick={() => navigate("/courses")}>
              <PlayCircle className="h-4 w-4" />
              Start attendance session
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/courses")}>
              Manage Courses
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/devices")}>
              Device Status
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest biometric scans from terminals.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground pb-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-border/40 pb-2">
                <div>
                  <div className="text-slate-200">Alice Johnson</div>
                  <div className="text-xs">ENG-101 (ESP32-Hall-A)</div>
                </div>
                <div className="text-xs text-sky-300">2 mins ago</div>
              </div>
              <div className="flex justify-between items-center border-b border-border/40 pb-2">
                <div>
                  <div className="text-slate-200">Sewankambo Erma</div>
                  <div className="text-xs">CS-302 (ESP32-Lab-1)</div>
                </div>
                <div className="text-xs text-sky-300">14 mins ago</div>
              </div>
              <div className="flex justify-between items-center border-b border-border/40 pb-2">
                <div>
                  <div className="text-slate-200">James Cole</div>
                  <div className="text-xs">Admin Login (Web)</div>
                </div>
                <div className="text-xs text-sky-300">1 hour ago</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Realtime signal</CardTitle>
            <CardDescription>
              Live activity feed from connected biometric units.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Waiting for incoming session data...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

