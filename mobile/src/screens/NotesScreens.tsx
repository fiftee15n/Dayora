import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import * as React from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { api, qs } from "../api";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Note } from "../types";
import { Card, Chips, Empty, ErrorBox, Fab, Icon, IconButton, Input, Loading, Row, Screen, Segmented, T, confirm, errorMessage, toast } from "../ui";
import { alpha, timeAgo } from "../utils";

export const NOTE_COLORS: Record<string, string> = {
  default: "",
  yellow: "#F59E0B",
  green: "#10B981",
  blue: "#0EA5E9",
  purple: "#8B5CF6",
  pink: "#EC4899",
};

export function NotesScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"notes" | "archived">("notes");

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cats = useQuery<string[]>("/api/notes/categories");
  const notes = useQuery<Note[]>(`/api/notes${qs({ q: search, category, archived: tab === "archived" ? "true" : undefined })}`);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Notes" subtitle="Thoughts and things to remember" back={() => nav.goBack()} refreshing={notes.refreshing} onRefresh={notes.refresh}>
        <Input value={q} onChangeText={setQ} placeholder="Search notes" right={<Icon name="search" size={18} color={c.mutedForeground} />} />
        <Segmented
          options={[
            { value: "notes", label: "Notes" },
            { value: "archived", label: "Archived" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {cats.data?.length ? (
          <Chips options={[{ value: null, label: "All" }, ...cats.data.map((x) => ({ value: x as string | null, label: x }))]} value={category} onChange={setCategory} />
        ) : null}
        {notes.error && !notes.data ? <ErrorBox error={notes.error} onRetry={notes.refresh} /> : null}
        {notes.loading ? <Loading /> : null}
        {notes.data && notes.data.length === 0 ? (
          <Empty icon="edit-3" title={tab === "archived" ? "No archived notes" : "No notes yet"} text={tab === "notes" ? "Capture ideas, lists and anything worth remembering." : undefined} action={tab === "notes" ? "New note" : undefined} onAction={() => nav.navigate("NoteEditor", { id: null, category })} />
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {notes.data?.map((n) => {
            const col = NOTE_COLORS[n.color] || "";
            return (
              <Pressable key={n.id} onPress={() => nav.navigate("NoteEditor", { id: n.id })} style={{ width: "48.5%" }}>
                <Card style={{ gap: 6, minHeight: 120, padding: 14, backgroundColor: col ? alpha(col, 0.12) : c.card, borderColor: col ? alpha(col, 0.35) : c.border }}>
                  <Row gap={6}>
                    <T weight="700" numberOfLines={2} style={{ flex: 1 }}>{n.title || "Untitled"}</T>
                    {n.pinned ? <Icon name="bookmark" size={14} color={c.primary} /> : null}
                  </Row>
                  <T variant="small" muted numberOfLines={5}>{n.content || "Empty note"}</T>
                  <View style={{ flex: 1 }} />
                  <Row style={{ justifyContent: "space-between" }}>
                    {n.category ? <T variant="caption" color={c.primary} numberOfLines={1} style={{ flex: 1 }}>#{n.category}</T> : <View />}
                    <T variant="caption" muted>{timeAgo(n.updated_at)}</T>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </View>
      </Screen>
      {tab === "notes" ? <Fab onPress={() => nav.navigate("NoteEditor", { id: null, category })} /> : null}
    </View>
  );
}

export type NoteEditorParams = { id: number | null; category?: string | null };

export function NoteEditorScreen({ route, navigation }: NativeStackScreenProps<{ NoteEditor: NoteEditorParams }, "NoteEditor">) {
  const c = useColors();
  const [note, setNote] = React.useState<Note | null>(null);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = React.useRef<Partial<Note>>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = React.useRef<number | null>(route.params.id);

  // Load an existing note, or create a new empty one straight away (same as the web app).
  React.useEffect(() => {
    (async () => {
      try {
        const n = route.params.id
          ? await api<Note>(`/api/notes/${route.params.id}`)
          : await api<Note>("/api/notes", { method: "POST", json: { title: "", content: "", category: route.params.category || null } });
        idRef.current = n.id;
        setNote(n);
        setTitle(n.title === "Untitled" && !route.params.id ? "" : n.title);
        setContent(n.content);
        setCategory(n.category ?? "");
        if (!route.params.id) invalidate("/api/notes", "/api/activity");
      } catch (e) {
        toast(errorMessage(e));
        navigation.goBack();
      }
    })();
  }, [route.params.id, route.params.category, navigation]);

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = pending.current;
    pending.current = {};
    if (!idRef.current || !Object.keys(changes).length) return;
    setStatus("saving");
    try {
      const updated = await api<Note>(`/api/notes/${idRef.current}`, { method: "PATCH", json: changes });
      setNote(updated);
      setStatus("saved");
      invalidate("/api/notes");
    } catch {
      pending.current = { ...changes, ...pending.current };
      setStatus("error");
    }
  }, []);

  function queue(changes: Partial<Note>, delay = 700) {
    pending.current = { ...pending.current, ...changes };
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }

  // Save whatever is pending when leaving the screen.
  React.useEffect(() => navigation.addListener("beforeRemove", () => void flush()), [navigation, flush]);

  async function patchNow(changes: Partial<Note>, message: string) {
    pending.current = { ...pending.current, ...changes };
    await flush();
    toast(message);
  }

  async function remove() {
    if (!note || !(await confirm("Delete note?", "This can't be undone."))) return;
    pending.current = {};
    await api(`/api/notes/${note.id}`, { method: "DELETE" }).catch((e) => toast(errorMessage(e)));
    invalidate("/api/notes", "/api/activity");
    navigation.goBack();
  }

  if (!note)
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );

  const accent = NOTE_COLORS[note.color] || c.primary;
  return (
    <Screen
      title={" "}
      back={() => navigation.goBack()}
      right={
        <Row gap={6}>
          <T variant="caption" muted>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Not saved" : ""}</T>
          <IconButton name="bookmark" color={note.pinned ? c.primary : c.mutedForeground} bg={note.pinned ? c.primarySoft : undefined} onPress={() => patchNow({ pinned: !note.pinned }, note.pinned ? "Unpinned" : "Pinned")} label="Pin" />
          <IconButton name="archive" onPress={async () => { await patchNow({ archived: !note.archived }, note.archived ? "Restored" : "Archived"); if (!note.archived) navigation.goBack(); }} label="Archive" />
          <IconButton name="trash-2" color={c.danger} onPress={remove} label="Delete" />
        </Row>
      }
    >
      <TextInput
        value={title}
        onChangeText={(v) => {
          setTitle(v);
          queue({ title: v });
        }}
        placeholder="Title"
        placeholderTextColor={c.mutedForeground}
        style={{ fontSize: 24, fontWeight: "800", color: c.foreground, paddingVertical: 4 }}
      />
      <Row gap={8} style={{ flexWrap: "wrap" }}>
        {Object.entries(NOTE_COLORS).map(([k, v]) => (
          <Pressable
            key={k}
            onPress={() => {
              setNote({ ...note, color: k });
              queue({ color: k }, 0);
            }}
            style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: v || c.card, borderWidth: 2, borderColor: note.color === k ? c.foreground : c.border }}
          />
        ))}
        <View style={{ flex: 1, minWidth: 120 }}>
          <TextInput
            value={category}
            onChangeText={(v) => {
              setCategory(v);
              queue({ category: v.trim() || null });
            }}
            placeholder="# category"
            placeholderTextColor={c.mutedForeground}
            style={{ color: accent, fontWeight: "600", paddingVertical: 2 }}
          />
        </View>
      </Row>
      <TextInput
        value={content}
        onChangeText={(v) => {
          setContent(v);
          queue({ content: v });
        }}
        placeholder="Start writing…"
        placeholderTextColor={c.mutedForeground}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 400, fontSize: 16, lineHeight: 24, color: c.foreground }}
      />
      <T variant="caption" muted>Changes save automatically · edited {timeAgo(note.updated_at)}</T>
    </Screen>
  );
}
