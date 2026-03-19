import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
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
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/courses", label: "Courses", icon: GraduationCap },
  { to: "/students", label: "Students", icon: Users },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppTopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Bugema Attendance
            </div>
            <div className="text-xs text-muted-foreground">Admin console</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-none">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
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
  return (
    <div className="hidden border-r border-border/60 bg-background/30 backdrop-blur lg:block">
      <div className="flex h-full w-64 flex-col px-3 py-4">
        <div className="px-3 pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
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
        <div className="mt-4 rounded-xl bg-secondary/40 p-3 ring-1 ring-border/60">
          <div className="text-sm font-semibold tracking-tight">
            Production-grade UI
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Clean typography, consistent spacing, accessible contrast.
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_45%),radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.10),transparent_55%)]">
      <AppTopBar />
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[16rem_1fr]">
        <SideNav />
        <main className="px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
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
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/courses", label: "Courses", icon: GraduationCap },
  { to: "/students", label: "Students", icon: Users },
  { to: "/devices", label: "Devices", icon: Cpu },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppTopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Bugema Attendance
            </div>
            <div className="text-xs text-muted-foreground">Admin console</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-none">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
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
  return (
    <div className="hidden border-r border-border/60 bg-background/30 backdrop-blur lg:block">
      <div className="flex h-full w-64 flex-col px-3 py-4">
        <div className="px-3 pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
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
        <div className="mt-4 rounded-xl bg-secondary/40 p-3 ring-1 ring-border/60">
          <div className="text-sm font-semibold tracking-tight">
            Production-grade UI
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Clean typography, consistent spacing, accessible contrast.
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_45%),radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.10),transparent_55%)]">
      <AppTopBar />
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[16rem_1fr]">
        <SideNav />
        <main className="px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

