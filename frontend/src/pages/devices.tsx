import React from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
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
          <h1 className="text-xl font-semibold tracking-tight">Terminal Discovery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor and link your ESP32 biometric units. Devices appear here automatically once powered on.
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

    <div className="grid gap-6">
      <Card className="gradient-border-card border-violet-500/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Active Biometric Units</CardTitle>
            <CardDescription>
              {loading
                ? "Searching for signals..."
                : `${devices.length.toLocaleString()} device${
                    devices.length === 1 ? "" : "s"
                  } mapped to this system.`}
            </CardDescription>
          </div>
          <Cpu className="h-5 w-5 text-violet-400 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/20">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">Hardware ID</th>
                  <th className="px-4 py-3 text-left">Friendly Name</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Signal Strength</th>
                  <th className="px-4 py-3 text-left">Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground italic">
                      No terminals discovered yet. Power on your ESP32 and ensure it is connected to WiFi.
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[10px] text-sky-300">
                        {d.id}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {d.name || "Device " + d.id.slice(-4)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-1.5 w-1.5 rounded-full", d.status === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-500")} />
                          <span className="capitalize text-xs">{d.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {[1,2,3,4].map(bar => (
                            <div key={bar} className={cn("w-1 rounded-sm", bar <= (d.signal_strength || 3) ? "h-3 bg-sky-400" : "h-1 bg-slate-700")} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(d.last_seen)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-secondary/10 border-dashed">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Pro Tip:</strong> To pair a new terminal, ensure the <code>DEVICE_ID</code> in its firmware is unique. 
            Once it makes its first heartbeat to your Render URL, it will automatically appear in this list above.
          </p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

