"use client";

import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Cloud,
  Loader2,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { api, qs, revalidate } from "@/lib/api";
import type { Note } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const NOTE_COLORS: Record<string, string> = {
  default: "transparent",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  pink: "#EC4899",
  amber: "#F59E0B",
  emerald: "#10B981",
  sky: "#0EA5E9",
};

type SaveState = "idle" | "saving" | "saved";

function Editor({ noteId, onBack, categories }: { noteId: number; onBack: () => void; categories: string[] }) {
  const { data: note } = useSWR<Note>(`/api/notes/${noteId}`, { revalidateOnFocus: false });
  const [draft, setDraft] = React.useState<Pick<Note, "title" | "content" | "category">>({ title: "", content: "", category: null });
  const [state, setState] = React.useState<SaveState>("idle");
  const loadedId = React.useRef<number | null>(null);
  const pending = React.useRef<Partial<Note>>({});
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (note && loadedId.current !== note.id) {
      loadedId.current = note.id;
      setDraft({ title: note.title, content: note.content, category: note.category });
      setState("idle");
    }
  }, [note]);

  const flush = React.useCallback(async () => {
    window.clearTimeout(timer.current);
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    setState("saving");
    try {
      await api(`/api/notes/${noteId}`, { method: "PATCH", json: changes });
      setState("saved");
      revalidate("/api/notes");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Autosave failed");
    }
  }, [noteId]);

  // Save pending edits when switching notes or leaving the page.
  React.useEffect(() => () => void flush(), [flush]);

  function change(patch: Partial<Note>) {
    setDraft((d) => ({ ...d, ...patch }));
    pending.current = { ...pending.current, ...patch };
    setState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  }

  async function update(patch: Partial<Note>, msg?: string) {
    await flush();
    await api(`/api/notes/${noteId}`, { method: "PATCH", json: patch });
    if (msg) toast.success(msg);
    revalidate("/api/notes");
  }

  async function remove() {
    if (!confirm("Delete this note permanently?")) return;
    pending.current = {};
    await api(`/api/notes/${noteId}`, { method: "DELETE" });
    toast.success("Note deleted");
    revalidate("/api/notes");
    onBack();
  }

  if (!note) return <Skeleton className="h-[60vh]" />;

  return (
    <Card className="flex min-h-[70vh] flex-col overflow-hidden" style={{ borderTop: note.color !== "default" ? `4px solid ${NOTE_COLORS[note.color]}` : undefined }}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to notes">
          <ArrowLeft />
        </Button>
        <span className="mr-auto flex items-center gap-1.5 px-2 text-xs text-muted-foreground" aria-live="polite">
          {state === "saving" ? (
            <><Loader2 className="size-3.5 animate-spin" /> Saving…</>
          ) : state === "saved" ? (
            <><Check className="size-3.5 text-success" /> Saved</>
          ) : (
            <><Cloud className="size-3.5" /> Edited {timeAgo(note.updated_at)}</>
          )}
        </span>
        <div className="flex items-center gap-1 px-1">
          {Object.entries(NOTE_COLORS).map(([name, c]) => (
            <button
              key={name}
              onClick={() => update({ color: name })}
              aria-label={`Color ${name}`}
              className={cn("size-5 rounded-full border border-border", note.color === name && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
              style={{ background: name === "default" ? "var(--card)" : c }}
            />
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={() => update({ pinned: !note.pinned }, note.pinned ? "Unpinned" : "Pinned")} aria-label={note.pinned ? "Unpin" : "Pin"}>
          {note.pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            await update({ archived: !note.archived }, note.archived ? "Note restored" : "Note archived");
            onBack();
          }}
          aria-label={note.archived ? "Unarchive" : "Archive"}
        >
          {note.archived ? <ArchiveRestore /> : <Archive />}
        </Button>
        <Button variant="ghost" size="icon" className="hover:text-danger" onClick={remove} aria-label="Delete note">
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-8">
        <input
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Untitled"
          className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
          aria-label="Note title"
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="size-4" />
          <input
            list="note-categories"
            value={draft.category ?? ""}
            onChange={(e) => change({ category: e.target.value || null })}
            placeholder="Add category"
            className="bg-transparent outline-none placeholder:text-muted-foreground/60"
            aria-label="Note category"
          />
          <datalist id="note-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="ml-auto text-xs">Created {format(new Date(note.created_at), "MMM d, yyyy")}</span>
        </div>
        <textarea
          value={draft.content}
          onChange={(e) => change({ content: e.target.value })}
          placeholder="Start writing…"
          className="min-h-[50vh] w-full flex-1 resize-none bg-transparent text-[15px] leading-7 outline-none placeholder:text-muted-foreground/50"
          aria-label="Note content"
        />
      </div>
    </Card>
  );
}

function NotesView() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const [tab, setTab] = React.useState<"notes" | "archived">("notes");
  const [category, setCategory] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: notes, isLoading } = useSWR<Note[]>(`/api/notes${qs({ q, category, archived: tab === "archived" ? "true" : undefined })}`);
  const { data: categories = [] } = useSWR<string[]>("/api/notes/categories");

  const select = (id: number | null) => router.replace(id ? `/notes?id=${id}` : "/notes", { scroll: false });

  async function create() {
    const note = await api<Note>("/api/notes", { method: "POST", json: { title: "", content: "", category: category || null } });
    revalidate("/api/notes");
    select(note.id);
  }

  return (
    <>
      <PageHeader
        title="Notes"
        description="Capture thoughts and keep important information in one place."
        actions={
          <Button onClick={create}>
            <Plus /> New note
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className={cn("space-y-3", selectedId && "hidden lg:block")}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search notes" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented
            className="w-full [&>button]:flex-1"
            value={tab}
            onChange={setTab}
            options={[
              { value: "notes", label: "Notes" },
              { value: "archived", label: "Archived" },
            ]}
          />
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {["", ...categories].map((c) => (
                <button
                  key={c || "all"}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c || "All"}
                </button>
              ))}
            </div>
          )}
          {isLoading && !notes ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)
          ) : notes && notes.length > 0 ? (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => select(n.id)}
                    className={cn(
                      "w-full rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-primary/40",
                      selectedId === n.id ? "border-primary ring-4 ring-primary/10" : "border-border",
                    )}
                    style={n.color !== "default" ? { borderLeft: `4px solid ${NOTE_COLORS[n.color]}` } : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <p className="flex-1 truncate font-semibold">{n.title || "Untitled"}</p>
                      {n.pinned && <Pin className="size-3.5 shrink-0 fill-primary text-primary" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.content || "No content"}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {n.category && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{n.category}</span>}
                      <span>{timeAgo(n.updated_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <EmptyState icon={NotebookPen} title={q ? "No matching notes" : tab === "archived" ? "No archived notes" : "No notes yet"} className="py-8" />
            </Card>
          )}
        </div>

        <div className={cn(!selectedId && "hidden lg:block")}>
          {selectedId ? (
            <Editor key={selectedId} noteId={selectedId} onBack={() => select(null)} categories={categories} />
          ) : (
            <Card className="grid min-h-[70vh] place-items-center">
              <EmptyState
                icon={NotebookPen}
                title="Select a note"
                description="Choose a note from the list or create a new one. Changes are saved automatically."
                action={<Button onClick={create}><Plus /> New note</Button>}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function NotesPage() {
  return (
    <React.Suspense>
      <NotesView />
    </React.Suspense>
  );
}
