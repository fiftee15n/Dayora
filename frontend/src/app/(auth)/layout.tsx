import { CheckCircle2, LineChart, Target, Wallet } from "lucide-react";

import { Logo } from "@/components/logo";

const FEATURES = [
  { icon: CheckCircle2, title: "Tasks that get done", text: "Plan your day with priorities, due dates and categories." },
  { icon: Wallet, title: "Money, made clear", text: "Track income, expenses and budgets with simple charts." },
  { icon: Target, title: "Habits that stick", text: "Build streaks and watch your consistency grow." },
  { icon: LineChart, title: "Insights that matter", text: "Weekly and monthly reports on how you spend your time." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-2xl" />
        <Logo className="relative [&_p:last-child]:text-white/80" />
        <div className="relative my-auto max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Your whole day,
            <br /> beautifully organized.
          </h2>
          <p className="mt-4 text-white/80">
            Dayora brings your tasks, finances, habits, reminders and notes together in one calm place.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-white/75">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Dayora</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </div>
  );
}
