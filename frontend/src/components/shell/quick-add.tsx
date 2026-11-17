"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { HabitDialog } from "@/components/forms/habit-dialog";
import { ReminderDialog } from "@/components/forms/reminder-dialog";
import { TaskDialog } from "@/components/forms/task-dialog";
import { TransactionDialog } from "@/components/forms/transaction-dialog";
import { api } from "@/lib/api";
import type { Note, TxType } from "@/lib/types";

type Kind = "task" | "expense" | "income" | "habit" | "reminder";

const Ctx = React.createContext<{ open: (k: Kind | "note") => void }>({ open: () => {} });
export const useQuickAdd = () => React.useContext(Ctx);

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = React.useState<Kind | null>(null);
  const router = useRouter();

  const open = React.useCallback(
    async (k: Kind | "note") => {
      if (k === "note") {
        try {
          const note = await api<Note>("/api/notes", { method: "POST", json: { title: "", content: "" } });
          router.push(`/notes?id=${note.id}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not create note");
        }
        return;
      }
      setKind(k);
    },
    [router],
  );

  const close = (o: boolean) => !o && setKind(null);
  const txType: TxType = kind === "income" ? "income" : "expense";

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <TaskDialog open={kind === "task"} onOpenChange={close} />
      <TransactionDialog
        open={kind === "expense" || kind === "income"}
        onOpenChange={close}
        defaultType={txType}
      />
      <HabitDialog open={kind === "habit"} onOpenChange={close} />
      <ReminderDialog open={kind === "reminder"} onOpenChange={close} />
    </Ctx.Provider>
  );
}
