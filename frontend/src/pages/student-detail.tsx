import React from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, Student, Fingerprint } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { Fingerprint as FingerprintIcon } from "lucide-react";

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = React.useState<Student | null>(null);
  const [fps, setFps] = React.useState<Fingerprint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const [s, f] = await Promise.all([
        api.student(id),
        api.studentFingerprints(id).catch(() => []),
      ]);
      setStudent(s);
      setFps(f);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to load student profile.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!id) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Student profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View biometric enrollment and identifiers for this student.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Core identifiers synced from MySQL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{student?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Student ID</span>
              <span className="font-mono text-xs text-sky-200">
                {student?.student_id ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="text-xs">{student?.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Year of study</span>
              <span>{student?.year_of_study ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Fingerprints</CardTitle>
              <CardDescription>
                Templates registered for this student on biometric devices.
              </CardDescription>
            </div>
            <FingerprintIcon className="h-5 w-5 text-sky-300" />
          </CardHeader>
          <CardContent>
            {fps.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 bg-secondary/30 px-3 py-4 text-xs text-muted-foreground">
                No fingerprints enrolled yet. Once the ESP32 device captures templates,
                they will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {fps.map((fp) => (
                  <div
                    key={fp.id}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Finger #{fp.finger_number}
                        </span>
                        {fp.is_primary && (
                          <Badge variant="success" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Quality {fp.quality_score ?? 0} • Device{" "}
                        {fp.device_id || "—"}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDateTime(fp.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

