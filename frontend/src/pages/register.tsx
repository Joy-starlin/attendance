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
    <div className="flex min-h-screen items-center justify-center p-4 bg-white dark:bg-zinc-950">
      <div className="w-full max-w-[400px] mt-8 mb-8">
        <div className="mb-8 text-center px-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
            <img src="/logo.png" alt="Bugema Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-white mb-2">
            Bugema University
          </h1>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Faculty & Staff Registration Portal
          </p>
        </div>
        <Card className="border-2 border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] rounded-xl bg-white dark:bg-zinc-950 overflow-hidden p-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-black dark:text-white">Account details</CardTitle>
            <CardDescription className="text-zinc-600 dark:text-zinc-400 font-medium">
              You can promote to full admin later from the console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-black dark:text-white font-bold tracking-tight">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-2 border-zinc-300 focus-visible:border-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-zinc-700 dark:focus-visible:border-white bg-white dark:bg-zinc-900 text-black dark:text-white rounded-lg h-11 transition-colors"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-black dark:text-white font-bold tracking-tight">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-2 border-zinc-300 focus-visible:border-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-zinc-700 dark:focus-visible:border-white bg-white dark:bg-zinc-900 text-black dark:text-white rounded-lg h-11 transition-colors"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-black dark:text-white font-bold tracking-tight">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-2 border-zinc-300 focus-visible:border-black focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-zinc-700 dark:focus-visible:border-white bg-white dark:bg-zinc-900 text-black dark:text-white rounded-lg h-11 transition-colors"
                  required
                />
              </div>
              {error && (
                <div className="rounded-md border-2 border-black bg-black text-white dark:bg-white dark:text-black px-4 py-3 text-sm font-medium">
                  {error}
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full border-2 border-transparent bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 h-12 text-base font-bold tracking-wide rounded-lg transition-all active:scale-[0.98]" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col items-center justify-center gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 pt-2 pb-4">
            <Link
              to="/login"
              className="text-black dark:text-white underline decoration-2 underline-offset-4 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              Already have access?
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

