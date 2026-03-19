import React from "react";
import { Link } from "react-router-dom";
import { api, ApiError, Student } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, RefreshCw } from "lucide-react";

export function StudentsPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.students();
      setStudents(data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to load students. Check the API and try again.";
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
          <h1 className="text-xl font-semibold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse student profiles captured in the biometric records.
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
            <CardTitle>Registered students</CardTitle>
            <CardDescription>
              {loading
                ? "Loading from MySQL…"
                : `${students.length.toLocaleString()} student${
                    students.length === 1 ? "" : "s"
                  } found.`}
            </CardDescription>
          </div>
          <Users className="h-5 w-5 text-emerald-300" />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Student ID</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Year</th>
                  <th className="px-3 py-2 text-left font-medium">Fingerprints</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      No students found yet. Once you import from your SIS or register
                      manually, they will appear here.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-sky-200">
                        {s.student_id || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {s.year_of_study ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={s.has_fingerprint ? "success" : "outline"}
                          className="text-[11px]"
                        >
                          {s.has_fingerprint ? "Enrolled" : "Not enrolled"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/students/${s.id}`}>Open profile</Link>
                        </Button>
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

