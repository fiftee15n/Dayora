"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { fieldErrors, registerSchema } from "@/lib/validators";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      const { name, email, password } = parsed.data;
      const json = { name, email, password };
      await api("/api/auth/register", { method: "POST", json });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Start making every day count — it&apos;s free.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </div>
        )}
        <Field label="Full name" error={errors.name} htmlFor="name">
          <Input id="name" autoComplete="name" placeholder="Sara Ahmed" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Email" error={errors.email} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters with letters and numbers" htmlFor="password">
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set("password")} aria-invalid={!!errors.password} />
        </Field>
        <Field label="Confirm password" error={errors.confirm} htmlFor="confirm">
          <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
