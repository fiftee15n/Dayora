import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const passwordRule = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Tell us your name").max(120),
    email: z.string().trim().email("Enter a valid email"),
    password: passwordRule,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z.string().nullable(),
  category_id: z.number().nullable(),
});

export const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number({ invalid_type_error: "Enter an amount" }).positive("Amount must be greater than 0"),
  description: z.string().max(255).optional(),
  payment_method: z.string(),
  date: z.string().min(1, "Pick a date"),
  category_id: z.number().nullable(),
});

export const habitSchema = z.object({
  name: z.string().trim().min(1, "Give your habit a name").max(120),
  description: z.string().max(2000).optional(),
  frequency: z.enum(["daily", "weekly"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string(),
});

export const reminderSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  remind_at: z.string({ required_error: "Pick a date and time" }).min(1, "Pick a date and time"),
  recurrence: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
});

/** Flatten zod errors to { field: message }. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
