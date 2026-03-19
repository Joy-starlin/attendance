import React from "react";
import { api, ApiError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { Cpu, RefreshCw } from "lucide-react";

export function DevicesPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [devices, setDevices] = React.useState<
    Array<{
      id: string;
      name: string | null;
      location: string | null;
      status: "online" | "offline" | "maintenance";
      last_seen: string | null;
      battery_level: number | null;
      signal_strength: number | null;
      firmware_version: string | null;
      total_scans: number;
      type: string;
    }>
  >([]);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.devices();
      setDevices(data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to load devices. Check the API and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function statusVariant(status: string) {
    switch (status) {
      case "online":
        return "success" as const;
      case "maintenance":
        return "warning" as const;
      default:
        return "outline" as const;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor ESP32 biometric units deployed across campus.
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
            <CardTitle>Registered devices</CardTitle>
            <CardDescription>
              {loading
                ? "Loading..."
                : `${devices.length.toLocaleString()} device${
                    devices.length === 1 ? "" : "s"
                  } found.`}
            </CardDescription>
          </div>
          <Cpu className="h-5 w-5 text-violet-300" />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-background/40">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Location</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Last seen</th>
                  <th className="px-3 py-2 text-right font-medium">Scans</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-xs text-muted-foreground"
                    >
                      No biometric devices registered.
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-sky-200">
                        {d.id}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium">
                        {d.name || "Unnamed device"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {d.location || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(d.status)} className="text-[11px]">
                          {d.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(d.last_seen)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {d.total_scans.toLocaleString()}
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

