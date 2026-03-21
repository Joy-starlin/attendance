import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatRole } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  Fingerprint,
  Cpu,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, roles: ["admin", "lecturer"] },
  { to: "/courses", label: "Courses", icon: GraduationCap, roles: ["admin", "lecturer"] },
  { to: "/devices", label: "Devices", icon: Cpu, roles: ["admin", "lecturer"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const;

function AppTopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6 xl:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <div className="text-md font-semibold tracking-tight">
              Bugema Attendance
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-none mb-1">{user?.name}</div>
            <div className="text-xs text-muted-foreground">
              <span className="capitalize">{user?.role ? formatRole(user.role) : ""}</span> &bull; {user?.email}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function SideNav() {
  const { user } = useAuth();
  return (
    <div className="hidden border-r border-border/60 bg-background/30 backdrop-blur lg:block">
      <div className="flex h-full w-64 flex-col px-3 py-4">
        <div className="px-3 pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.filter(item => item.roles.includes(user?.role as never)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={(item as any).end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
                  isActive &&
                    "bg-secondary/70 text-foreground ring-1 ring-border/60"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 px-3">
          <Separator />
        </div>

      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_45%),radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.10),transparent_55%)]">
      <AppTopBar />
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[16rem_1fr]">
        <SideNav />
        <main className="px-6 py-8 md:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
