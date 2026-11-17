"use client";

import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState<{ message: string; dev_reset_token?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email");
    setError("");
    setLoading(true);
    try {
      setSent(await api("/api/auth/forgot-password", { method: "POST", json: { email } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
      {sent ? (
        <div>
          <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <MailCheck className="size-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-muted-foreground">{sent.message}</p>
          {sent.dev_reset_token && (
            <div className="mt-6 rounded-xl border border-dashed border-primary/40 bg-primary-soft p-4 text-sm">
              <p className="font-semibold text-primary">Development mode</p>
              <p className="mt-1 text-muted-foreground">No email service is configured, so here&apos;s your reset link:</p>
              <Button asChild variant="default" size="sm" className="mt-3">
                <Link href={`/reset-password?token=${encodeURIComponent(sent.dev_reset_token)}`}>Reset password</Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Forgot your password?</h1>
          <p className="mb-8 mt-2 text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" error={error} htmlFor="email">
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
            </Field>
            <Button type="submit" variant="gradient" size="lg" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        </>
      )}
    </>
  );
}
