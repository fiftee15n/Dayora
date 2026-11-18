"use client";

import { Camera, Download, LogOut, Monitor, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/password-input";
import { useTheme } from "@/components/providers";
import { Avatar } from "@/components/shell/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { useUser } from "@/hooks/use-user";
import { api, ApiError, revalidate } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn, CURRENCIES } from "@/lib/utils";
import { passwordRule } from "@/lib/validators";

function ProfileCard({ user }: { user: User }) {
  const { mutate } = useUser();
  const [form, setForm] = React.useState({ name: user.name, email: user.email, currency: user.currency });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: "Name is required" });
    setErrors({});
    setSaving(true);
    try {
      const updated = await api<User>("/api/users/me", { method: "PATCH", json: form });
      mutate(updated, false);
      revalidate("/api/dashboard");
      toast.success("Profile updated");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be 2 MB or smaller");
    const body = new FormData();
    body.append("file", file);
    setUploading(true);
    try {
      const updated = await api<User>("/api/users/me/avatar", { method: "POST", body });
      mutate(updated, false);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    try {
      mutate(await api<User>("/api/users/me/avatar", { method: "DELETE" }), false);
      toast.success("Profile picture removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove picture");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your personal information and preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <Avatar name={user.name} src={user.avatar_url} className="size-20 text-xl" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow"
              aria-label="Change profile picture"
            >
              <Camera className="size-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-muted-foreground">
              {uploading ? "Uploading…" : `Member since ${new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
            </p>
            {user.avatar_url && !uploading && (
              <button type="button" onClick={removeAvatar} className="mt-1 text-xs font-medium text-muted-foreground hover:text-danger">
                Remove photo
              </button>
            )}
          </div>
        </div>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Full name" error={errors.name} htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" error={errors.email} htmlFor="p-email">
            <Input id="p-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Currency" hint="Used across expenses and reports" htmlFor="p-cur">
            <Select id="p-cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end justify-end sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = React.useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = passwordRule.safeParse(form.next);
    if (!form.current) return setErrors({ current: "Enter your current password" });
    if (!r.success) return setErrors({ next: r.error.issues[0]!.message });
    if (form.next !== form.confirm) return setErrors({ confirm: "Passwords don't match" });
    setErrors({});
    setSaving(true);
    try {
      await api("/api/users/me/password", { method: "POST", json: { current_password: form.current, new_password: form.next } });
      setForm({ current: "", next: "", confirm: "" });
      toast.success("Password changed");
    } catch (err) {
      setErrors({ current: err instanceof Error ? err.message : "Could not change password" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" /> Password & security
        </CardTitle>
        <CardDescription>Use a strong password you don&apos;t use elsewhere.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
          <Field label="Current password" error={errors.current} htmlFor="pw-cur">
            <PasswordInput id="pw-cur" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </Field>
          <Field label="New password" error={errors.next} htmlFor="pw-new">
            <PasswordInput id="pw-new" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </Field>
          <Field label="Confirm new password" error={errors.confirm} htmlFor="pw-conf">
            <PasswordInput id="pw-conf" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
          <div className="flex justify-end sm:col-span-3">
            <Button type="submit" loading={saving}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Dayora looks on this device.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition",
              theme === value ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-muted",
            )}
          >
            <Icon className="size-5" /> {label}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function DangerCard() {
  const router = useRouter();
  async function logoutAll() {
    await api("/api/auth/logout-all", { method: "POST" });
    toast.success("Signed out of all devices");
    router.replace("/login");
  }
  async function deleteAccount() {
    const typed = prompt('This permanently deletes your account and all data. Type "DELETE" to confirm.');
    if (typed !== "DELETE") return;
    await api("/api/users/me", { method: "DELETE" });
    router.replace("/register");
  }
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage sessions and your data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Sign out everywhere</p>
            <p className="text-xs text-muted-foreground">Ends sessions on all browsers and the mobile app.</p>
          </div>
          <Button variant="outline" onClick={logoutAll}>
            <LogOut /> Sign out all
          </Button>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Export your data</p>
            <p className="text-xs text-muted-foreground">Download all your tasks, finances, habits, reminders and notes as JSON.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/api/users/me/export" download>
              <Download /> Export
            </a>
          </Button>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-danger">Delete account</p>
            <p className="text-xs text-muted-foreground">Permanently remove your account and all personal data.</p>
          </div>
          <Button variant="destructive" onClick={deleteAccount}>
            <Trash2 /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, security and preferences." />
      {!user ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <ProfileCard user={user} />
            <PasswordCard />
          </div>
          <div className="space-y-6">
            <AppearanceCard />
            <DangerCard />
          </div>
        </div>
      )}
    </>
  );
}
