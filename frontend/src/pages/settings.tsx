import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  const [apiBase, setApiBase] = React.useState(
    import.meta.env.VITE_API_BASE || ""
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System configuration and preferences.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API endpoint</CardTitle>
            <CardDescription>
              The UI talks to the Node MySQL API running on your servers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <Label htmlFor="apiBase">Base URL</Label>
              <Input
                id="apiBase"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="http://localhost:3008"
              />
              <p className="text-xs text-muted-foreground">
                This value is compiled from <code>VITE_API_BASE</code>. For production,
                you&apos;ll typically point this at your Railway/Render/VM hostname.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled>
              Save (via environment variables)
            </Button>
          </CardContent>
        </Card>


      </div>
    </div>
  );
}

