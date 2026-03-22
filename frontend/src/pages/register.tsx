import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, UserRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Fingerprint, Loader2 } from "lucide-react";

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [role, setRole] = React.useState<UserRole>("lecturer");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await api.register({ name, email, password, role });
      setAuth(resp);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 400
          ? "That email is already registered."
          : err instanceof Error
          ? err.message
          : "Unable to create account, please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_bottom,rgba(129,140,248,0.22),transparent_55%)]">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center px-2">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-border">
            <img src="/logo.png" alt="Bugema Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bugema University
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Faculty & Staff Registration Portal.
          </p>
        </div>
        <Card className="gradient-border-card">
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>
              You can promote to full admin later from the console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <span>Accounts can be disabled from the admin area.</span>
            <Link
              to="/login"
              className="font-medium text-primary hover:text-primary/80"
            >
              Already have access?
            </Link>
          </CardFooter>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          For security, use unique credentials for this deployment.
        </p>
      </div>
    </div>
  );
}

