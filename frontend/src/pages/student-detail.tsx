import React from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, Student, Fingerprint } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { Fingerprint as FingerprintIcon, CheckCircle, Circle, AlertCircle, X, Loader2 } from "lucide-react";

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = React.useState<Student | null>(null);
  const [fps, setFps] = React.useState<Fingerprint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  // Enrollment State
  const [showEnrollModal, setShowEnrollModal] = React.useState(false);
  const [devices, setDevices] = React.useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string>("");
  const [enrollStatus, setEnrollStatus] = React.useState<{ status: string, message: string } | null>(null);
  const [enrolling, setEnrolling] = React.useState(false);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button 
            className="bg-primary hover:bg-primary text-foreground shadow-lg shadow-sky-900/20" 
            size="sm"
            onClick={async () => {
              const d = await api.devices();
              setDevices(d);
              if (d.length > 0) setSelectedDeviceId(d[0].id);
              setShowEnrollModal(true);
            }}
          >
            <FingerprintIcon className="mr-2 h-4 w-4" />
            Enroll Fingerprint
          </Button>
        </div>
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
              <span className="font-mono text-xs text-primary/80">
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
            <FingerprintIcon className="h-5 w-5 text-primary" />
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

      {/* Live Enrollment Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200">
            <Card className="border-border/80 shadow-2xl overflow-hidden">
              <div className="absolute top-3 right-3">
                <Button variant="ghost" size="icon" onClick={() => setShowEnrollModal(false)} className="h-8 w-8 rounded-full">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardHeader className="bg-secondary/20 border-b border-border/40 pb-4">
                <CardTitle className="text-lg">Live Biometric Enrollment</CardTitle>
                <CardDescription>Follow the prompts to capture fingerprint templates.</CardDescription>
              </CardHeader>
              
              <CardContent className="pt-6 space-y-6">
                {!enrolling && !enrollStatus ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select Hardware Device</label>
                      <select 
                        className="w-full bg-background/50 border border-border/60 rounded-md p-2 text-sm focus:ring-1 focus:ring-primary"
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                      >
                        {devices.filter(d => d.status === 'online').length === 0 && (
                          <option disabled>No devices online</option>
                        )}
                        {devices.filter(d => d.status === 'online').map(d => (
                          <option key={d.id} value={d.id}>{d.name || d.id} ({d.location || 'Unknown'})</option>
                        ))}
                      </select>
                    </div>
                    <Button 
                      className="w-full bg-primary hover:bg-primary" 
                      onClick={async () => {
                        setEnrolling(true);
                        setEnrollStatus({ status: 'STARTING', message: 'Waiting for device response...' });
                        try {
                          await api.enrollDevice(selectedDeviceId, id!);
                          
                          // Connect to WebSocket for live logs
                          const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/enrollment`);
                          ws.onmessage = (event) => {
                            const data = JSON.parse(event.data);
                            if (data.type === 'device_log' && data.device_id === selectedDeviceId) {
                              setEnrollStatus({ status: data.status, message: data.message });
                              if (data.status === 'SUCCESS') {
                                setTimeout(() => {
                                  ws.close();
                                  setShowEnrollModal(false);
                                  load();
                                }, 3000);
                              }
                            }
                          };
                        } catch (err: any) {
                          setEnrollStatus({ status: 'ERROR', message: err.message || 'Failed to start enrollment' });
                          setEnrolling(false);
                        }
                      }}
                      disabled={devices.filter(d => d.status === 'online').length === 0}
                    >
                      Start Remote Enrollment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6 flex flex-col items-center py-4">
                    <div className="relative">
                      <div className={`p-6 rounded-full border-4 transition-all duration-500 ${
                        enrollStatus?.status === 'SUCCESS' ? 'border-emerald-500 bg-emerald-500/10' :
                        enrollStatus?.status.startsWith('ERROR') ? 'border-rose-500 bg-rose-500/10' :
                        'border-primary/30 bg-primary/5 animate-pulse'
                      }`}>
                        {enrollStatus?.status === 'SUCCESS' ? (
                          <CheckCircle className="h-12 w-12 text-emerald-500" />
                        ) : enrollStatus?.status.startsWith('ERROR') ? (
                          <AlertCircle className="h-12 w-12 text-rose-500" />
                        ) : (
                          <FingerprintIcon className="h-12 w-12 text-primary" />
                        )}
                      </div>
                      {(!enrollStatus?.status.includes('SUCCESS') && !enrollStatus?.status.includes('ERROR')) && (
                        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    
                    <div className="text-center space-y-2">
                      <h3 className="font-semibold text-lg">
                        {enrollStatus?.status === 'WAITING_FOR_SCAN_1' ? "First Scan" :
                         enrollStatus?.status === 'SCAN_1_OK' ? "Lift Finger" :
                         enrollStatus?.status === 'WAITING_FOR_SCAN_2' ? "Second Scan" :
                         enrollStatus?.status === 'SUCCESS' ? "Enrollment Success!" :
                         enrollStatus?.status === 'STARTING' ? "Initializing..." : "Enrollment in Progress"}
                      </h3>
                      <p className="text-sm text-muted-foreground px-4">
                        {enrollStatus?.message}
                      </p>
                    </div>

                    <div className="w-full max-w-[200px] flex justify-between px-2">
                       <div className={`h-2 w-12 rounded-full ${['WAITING_FOR_SCAN_1', 'SCAN_1_OK', 'WAITING_FOR_SCAN_2', 'SUCCESS'].includes(enrollStatus?.status || '') ? 'bg-primary' : 'bg-secondary'}`} />
                       <div className={`h-2 w-12 rounded-full ${['WAITING_FOR_SCAN_2', 'SUCCESS'].includes(enrollStatus?.status || '') ? 'bg-primary' : 'bg-secondary'}`} />
                       <div className={`h-2 w-12 rounded-full ${enrollStatus?.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-secondary'}`} />
                    </div>
                  </div>
                )}
              </CardContent>
              {enrollStatus?.status.startsWith('ERROR') && (
                <div className="p-6 pt-0">
                  <Button className="w-full" variant="outline" onClick={() => { setEnrollStatus(null); setEnrolling(false); }}>
                    Retry Enrollment
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

