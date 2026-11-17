"use client";

import {
  Bell,
  CheckSquare,
  LogOut,
  Menu,
  Monitor,
  Moon,
  NotebookPen,
  Plus,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Logo } from "@/components/logo";
import { useTheme } from "@/components/providers";
import { Avatar } from "@/components/shell/avatar";
import { NAV, SETTINGS_NAV } from "@/components/shell/nav";
import { QuickAddProvider, useQuickAdd } from "@/components/shell/quick-add";
import { ReminderNotifier } from "@/components/shell/reminder-notifier";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/use-user";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = [...NAV, SETTINGS_NAV];
  return (
    <nav className="space-y-1">
      {items.map(({ href, label, icon: Icon }, i) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <React.Fragment key={href}>
            {i === NAV.length && <div className="my-3 h-px bg-border" />}
            <Link
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[18px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {label}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <Link href="/dashboard" onClick={onNavigate}>
        <Logo />
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto rounded-2xl brand-gradient p-4 text-white">
        <p className="text-sm font-semibold">Make every day count ✨</p>
        <p className="mt-1 text-xs text-white/80">Small, consistent steps lead to big results.</p>
      </div>
    </div>
  );
}

function QuickAddMenu() {
  const { open } = useQuickAdd();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="gradient" size="sm" className="h-9 rounded-xl px-3.5">
          <Plus /> <span className="hidden sm:inline">Quick add</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => open("task")}>
          <CheckSquare /> New task
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("expense")}>
          <TrendingDown /> Add expense
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("income")}>
          <TrendingUp /> Add income
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("habit")}>
          <Target /> New habit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("reminder")}>
          <Bell /> New reminder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("note")}>
          <NotebookPen /> New note
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          {resolved === "dark" ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36">
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ] as const
        ).map(([value, label, Icon]) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className={cn(theme === value && "bg-primary-soft text-primary [&_svg]:text-primary")}
          >
            <Icon /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user } = useUser();
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-2" aria-label="Account menu">
        <Avatar name={user?.name ?? ""} src={user?.avatar_url} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
          <p className="truncate text-xs font-normal">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <UserIcon /> Profile & settings
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={logout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <QuickAddProvider>
      <div className="min-h-dvh lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card lg:block">
          <SidebarContent />
        </aside>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent side="left" title="Navigation">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </DialogContent>
        </Dialog>

        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Logo className="[&_p:last-child]:hidden [&_svg]:size-8" />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <QuickAddMenu />
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
      <ReminderNotifier />
    </QuickAddProvider>
  );
}
