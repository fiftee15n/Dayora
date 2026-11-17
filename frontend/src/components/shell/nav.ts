import {
  CalendarDays,
  CheckSquare,
  History,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Target,
  Wallet,
} from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/habits", label: "Habits", icon: Target },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/history", label: "History", icon: History },
] as const;

export const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: Settings };
