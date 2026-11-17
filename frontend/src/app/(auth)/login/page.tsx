"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { fieldErrors, loginSchema } from "@/lib/validators";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = React.useState({ email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", json: parsed.data });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && (
        <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {formError}
        </div>
      )}
      <Field label="Email" error={errors.email} htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          aria-invalid={!!errors.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Password" error={errors.password} htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          aria-invalid={!!errors.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" variant="gradient" size="lg" className="w-full" loading={loading}>
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back 👋</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Sign in to continue organizing your day.</p>
      <React.Suspense>
        <LoginForm />
      </React.Suspense>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to Dayora?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
