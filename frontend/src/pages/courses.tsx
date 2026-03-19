import React from "react";
import { api, ApiError, Course } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, RefreshCw } from "lucide-react";

export function CoursesPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [courses, setCourses] = React.useState<Course[]>([]);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.courses();
      setCourses(data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to load courses. Check the API and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View lecture units registered in the biometric attendance system.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Configured courses</CardTitle>
            <CardDescription>
              {loading
                ? "Loading from MySQL…"
                : `${courses.length.toLocaleString()} course${
                    courses.length === 1 ? "" : "s"
                  } found.`}
            </CardDescription>
          </div>
          <GraduationCap className="h-5 w-5 text-sky-300" />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Lecturer</th>
                  <th className="px-3 py-2 text-left font-medium">Total classes</th>
                  <th className="px-3 py-2 text-left font-medium">Pass rule</th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      No courses found yet. Once you seed data in MySQL, they will appear
                      here automatically.
                    </td>
                  </tr>
                ) : (
                  courses.map((course) => (
                    <tr
                      key={course.id}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-sky-200">
                        {course.code}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium">{course.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {course.lecturer_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {course.total_classes ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">
                          {course.pass_criteria ?? 75}% required
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

