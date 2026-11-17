export type Priority = "low" | "medium" | "high";
export type TxType = "income" | "expense";
export type Frequency = "daily" | "weekly";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  currency: string;
  created_at: string;
}

export interface TaskCategory {
  id: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  category_id: number | null;
  category: TaskCategory | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  kind: TxType;
  color: string;
  icon: string;
}

export interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  description: string | null;
  payment_method: string;
  date: string;
  category_id: number | null;
  category: ExpenseCategory | null;
  created_at: string;
}

export interface Budget {
  id: number;
  month: string;
  amount: number;
  category_id: number | null;
  category: ExpenseCategory | null;
  spent: number;
}

export interface FinanceSummary {
  start: string;
  end: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
  by_category: { category_id: number | null; name: string; color: string; total: number; percent: number }[];
  top_category: { name: string; total: number; percent: number; color: string } | null;
  daily: { date: string; income: number; expense: number }[];
  by_payment_method: Record<string, number>;
}

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  frequency: Frequency;
  color: string;
  icon: string;
  archived: boolean;
  created_at: string;
  done_today: boolean;
  done_this_week: boolean;
  current_streak: number;
  best_streak: number;
  completion_rate: number;
  recent_logs: string[];
}

export interface HabitOverview {
  total: number;
  due_today: number;
  done_today: number;
  progress: number;
  best_streak: number;
  average_completion: number;
  calendar: { date: string; count: number }[];
}

export interface Reminder {
  id: number;
  title: string;
  description: string | null;
  remind_at: string;
  recurrence: Recurrence;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  category: string | null;
  color: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  description: string;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface DaySeries {
  date: string;
  tasks_completed: number;
  income: number;
  expense: number;
  habit_checkins: number;
}

export interface Dashboard {
  user: { name: string; avatar_url: string | null };
  today: string;
  tasks: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    due_today: number;
    due_today_completed: number;
    completed_today: number;
  };
  today_tasks: Task[];
  finance: {
    currency: string;
    today_income: number;
    today_expense: number;
    month_income: number;
    month_expense: number;
    month_balance: number;
    budget: { amount: number; spent: number } | null;
  };
  upcoming_reminders: Reminder[];
  habits: { total: number; done: number; progress: number; items: Habit[] };
  week: DaySeries[];
  month_summary: { tasks_completed: number; habit_checkins: number; income: number; expense: number };
  recent_activity: Activity[];
}

export interface Report {
  period: "week" | "month";
  start: string;
  end: string;
  tasks_completed: number;
  income: number;
  expense: number;
  balance: number;
  habit_checkins: number;
  tasks_created: number;
  reminders_completed: number;
  habit_rate: number;
  most_productive_day: string | null;
  series: DaySeries[];
  top_categories: { name: string; color: string; total: number }[];
}
