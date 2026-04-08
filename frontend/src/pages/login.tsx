import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Fingerprint, Loader2 } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const { setAuth } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await api.login(email.trim(), password);
      setAuth(resp);
      const dest = location.state?.from || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Invalid email or password."
          : err instanceof Error
          ? err.message
          : "Unable to sign in, please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center px-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-card p-2 border border-border shadow-lg">
            <img src="/logo.png" alt="Bugema Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            Bugema University
          </h1>
          <p className="text-sm font-medium text-muted-foreground">
            Faculty & Staff Attendance Portal
          </p>
        </div>
        <Card className="border border-border shadow-lg rounded-xl bg-card overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Welcome</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@bugema.ac.ug"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-input focus-visible:ring-1 focus-visible:ring-ring bg-background text-foreground rounded-lg h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border border-input focus-visible:ring-1 focus-visible:ring-ring bg-background text-foreground rounded-lg h-11"
                  required
                />
              </div>
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 text-destructive px-4 py-3 text-sm font-medium">
                  {error}
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 text-base font-semibold rounded-lg transition-all active:scale-[0.98]" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing you in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center text-sm text-muted-foreground pt-2 pb-4">
            <Link
              to="/register"
              className="text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Need an account?
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

