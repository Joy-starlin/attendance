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
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, roles: ["admin", "lecturer"] },
  { to: "/courses", label: "Courses", icon: GraduationCap, roles: ["admin", "lecturer"] },
  { to: "/students", label: "Students", icon: Users, roles: ["admin", "lecturer"] },
  { to: "/devices", label: "Devices", icon: Cpu, roles: ["admin", "lecturer"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_45%),radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.10),transparent_55%)]">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={toggleMenu}
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
              <Fingerprint className="h-4 w-4" />
            </div>
            <div className="hidden xs:block">
              <div className="text-xs font-semibold tracking-tight">
                Faculty Portal
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium leading-none mb-1">{user?.name}</div>
              <div className="text-[10px] text-muted-foreground">
                <span className="capitalize">{user?.role ? formatRole(user.role) : ""}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 sm:px-3 text-xs"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="sm:mr-2 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[16rem_1fr]">
        {/* Sidebar - Desktop */}
        <aside className="hidden border-r border-border/60 bg-background/30 backdrop-blur lg:block min-h-[calc(100vh-3.5rem)]">
          <div className="flex h-full w-64 flex-col px-3 py-6">
            <div className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-sky-400/80">
              Faculty Menu
            </div>
            <nav className="space-y-1">
              {navItems.filter(item => item.roles.includes(user?.role as never)).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={(item as any).end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-sky-500/10 hover:text-sky-100",
                      isActive && "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeMenu} />
            <aside className="absolute bottom-0 left-0 top-14 w-64 border-r border-border/60 bg-background shadow-2xl animate-in slide-in-from-left duration-300">
              <div className="flex h-full flex-col px-3 py-6">
                <div className="px-3 pb-3 text-xs font-semibold uppercase tracking-wider text-sky-400/80">
                  Faculty Menu
                </div>
                <nav className="space-y-1">
                  {navItems.filter(item => item.roles.includes(user?.role as never)).map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={(item as any).end}
                      onClick={closeMenu}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-sky-500/10 hover:text-sky-100",
                          isActive && "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
                <div className="mt-auto p-3">
                   <div className="p-3 rounded-lg bg-secondary/20 border border-border/40">
                      <div className="text-xs font-medium truncate">{user?.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
                   </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        <main className="px-4 py-8 sm:px-6 md:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
