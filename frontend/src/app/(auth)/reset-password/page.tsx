"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { api } from "@/lib/api";
import { passwordRule } from "@/lib/validators";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = passwordRule.safeParse(password);
    if (!r.success) return setErrors({ password: r.error.issues[0]!.message });
    if (password !== confirm) return setErrors({ confirm: "Passwords don't match" });
    setErrors({});
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { token, new_password: password } });
      await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      toast.success("Password updated — please sign in.");
      router.replace("/login");
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Could not reset password" });
      setLoading(false);
    }
  }

  if (!token)
    return (
      <p className="text-muted-foreground">
        This reset link is missing its token.{" "}
        <Link className="font-semibold text-primary" href="/forgot-password">
          Request a new one
        </Link>
        .
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errors.form && (
        <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {errors.form}
        </div>
      )}
      <Field label="New password" error={errors.password} hint="At least 8 characters with letters and numbers" htmlFor="pw">
        <PasswordInput id="pw" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm new password" error={errors.confirm} htmlFor="pw2">
        <PasswordInput id="pw2" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" variant="gradient" size="lg" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Choose something secure that you&apos;ll remember.</p>
      <React.Suspense>
        <ResetForm />
      </React.Suspense>
    </>
  );
}
