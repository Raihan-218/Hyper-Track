import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import type { TaskDTO, TaskPriority, TaskStatus } from "@hyper-track/shared";
import { api, isApiOffline } from "../lib/api";
import { AppButton, AppCard, AppField, AppText, ChoicePill, EmptyState, ProgressBar, SectionTitle } from "./ui";
import { fontSizes, radii, spacing, useAppTheme } from "../theme/theme";

export type TaskRecord = Omit<TaskDTO, "project" | "parentTask"> & { project?: { _id: string; name: string } | null; parentTask?: { _id: string; title: string } | null; archivedAt?: string | null };
export type TaskDraft = { title: string; priority: TaskPriority; dueDate: string; plannedDate: string; reminderAt: string; recurrence: "none" | "daily" | "weekly"; projectId: string | null; parentTaskId: string | null };
export type TaskEditorKey = keyof TaskDraft;
type ProjectOption = { _id: string; name: string };
type TaskPage = { tasks: TaskRecord[]; total: number; limit: number; page: number };
type TaskView = "inbox" | "today" | "upcoming" | "all" | "completed" | "archived";
const views: Array<{ id: TaskView; label: string }> = [
  { id: "inbox", label: "Inbox" }, { id: "today", label: "Today" }, { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All tasks" }, { id: "completed", label: "Completed" }, { id: "archived", label: "Archived" },
];

function localDate(value: string, timezone: string) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function TaskRow({ task, timezone, onEdit, onToggle, onArchive, archived }: { task: TaskRecord; timezone: string; onEdit?: (task: TaskRecord) => void; onToggle?: (task: TaskRecord) => void; onArchive?: (task: TaskRecord) => void; archived?: boolean }) {
  const { colors } = useAppTheme();
  const dateLabel = task.dueDate ? `Due ${localDate(task.dueDate, timezone)}` : task.plannedDate ? `Planned ${task.plannedDate}` : null;
  return <View style={[styles.taskRow, { borderBottomColor: colors.border }, task.parentTask && styles.subtaskRow]}>
    {!archived && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.status === "done" }} accessibilityLabel={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`} onPress={() => onToggle?.(task)} style={[styles.taskCheck, { borderColor: task.status === "done" ? colors.success : colors.border, backgroundColor: task.status === "done" ? colors.successSoft : "transparent" }]}><AppText size={12} weight="bold" style={{ color: colors.success }}>{task.status === "done" ? "✓" : ""}</AppText></Pressable>}
    <View style={styles.taskCopy}>
      <AppText size={14} weight="medium" style={task.status === "done" ? { textDecorationLine: "line-through", color: colors.textMuted } : undefined}>{task.parentTask ? `↳ ${task.title}` : task.title}</AppText>
      <View style={styles.metaRow}>
        <View style={[styles.priorityDot, { backgroundColor: task.priority === "high" ? colors.danger : task.priority === "medium" ? colors.warning : colors.success }]} />
        <AppText size={11} muted>{task.priority} · {task.status === "todo" ? "To do" : task.status === "in_progress" ? "In progress" : "Completed"}{dateLabel ? ` · ${dateLabel}` : " · Inbox"}{task.recurrence && task.recurrence !== "none" ? ` · Repeats ${task.recurrence}` : ""}{task.project?.name ? ` · ${task.project.name}` : ""}{task.parentTask ? ` · Subtask of ${task.parentTask.title}` : ""}</AppText>
      </View>
    </View>
    {!archived && <View style={styles.rowActions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={() => onEdit?.(task)} style={styles.actionButton}><AppText size={12} weight="semibold" style={{ color: colors.primary }}>Edit</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Archive ${task.title}`} onPress={() => onArchive?.(task)} style={styles.actionButton}><AppText size={17} muted>×</AppText></Pressable></View>}
    {archived && task.archivedAt && <AppText size={11} muted>Archived {localDate(task.archivedAt, timezone)}</AppText>}
  </View>;
}

export function TaskManagementScreen({ tasks, projects, timezone, today, draft, editingId, error, onDraftChange, onSubmit, onReset, onEdit, onToggle, onArchive }: {
  tasks: TaskRecord[]; projects: ProjectOption[]; timezone: string; today: string; draft: TaskDraft; editingId: string | null; error: string;
  onDraftChange: (key: TaskEditorKey, value: TaskDraft[TaskEditorKey]) => void; onSubmit: () => void; onReset: () => void;
  onEdit: (task: TaskRecord) => void; onToggle: (task: TaskRecord) => void; onArchive: (task: TaskRecord) => void;
}) {
  const { colors } = useAppTheme();
  const [view, setView] = useState<TaskView>("today");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [sort, setSort] = useState<"due" | "priority" | "newest" | "oldest" | "title">("due");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<TaskRecord[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archivePartial, setArchivePartial] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);

  useEffect(() => { if (editingId) setDetailsOpen(true); }, [editingId]);
  useEffect(() => {
    if (view !== "archived" || archiveLoaded) return;
    let active = true;
    setArchivedLoading(true); setArchiveError("");
    void (async () => {
      try {
        const first = await api<TaskPage>("/tasks?archived=true&limit=100&page=1");
        let later: TaskPage[] = [];
        try { later = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / first.limit) - 1) }, (_, index) => api<TaskPage>(`/tasks?archived=true&limit=${first.limit}&page=${index + 2}`))); }
        catch (error) { if (!isApiOffline()) throw error; if (active) setArchivePartial(first.total > first.limit); }
        if (active) { setArchivedTasks([...first.tasks, ...later.flatMap((page) => page.tasks)]); setArchiveLoaded(true); }
      } catch (error) { if (active) setArchiveError(error instanceof Error ? error.message : "Could not load archived tasks."); }
      finally { if (active) setArchivedLoading(false); }
    })();
    return () => { active = false; };
  }, [archiveLoaded, view]);

  const sourceTasks = view === "archived" ? archivedTasks : tasks;
  const scopedTasks = useMemo(() => sourceTasks.filter((task) => {
    const due = task.dueDate ? localDate(task.dueDate, timezone) : null;
    const date = task.plannedDate;
    if (view === "archived") return true;
    if (view === "inbox") return task.status !== "done" && !date && !due;
    if (view === "today") return date === today || !!due && due <= today;
    if (view === "upcoming") return task.status !== "done" && (date ? date > today : false) || task.status !== "done" && !!due && due > today;
    if (view === "completed") return task.status === "done";
    return true;
  }).filter((task) => !search.trim() || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((task) => priority === "all" || task.priority === priority)
    .filter((task) => status === "all" || task.status === status), [sourceTasks, view, timezone, today, search, priority, status]);
  const sortedTasks = useMemo(() => [...scopedTasks].sort((a, b) => {
    if (sort === "priority") return ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) || a.title.localeCompare(b.title);
    if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (sort === "title") return a.title.localeCompare(b.title);
    const aDate = a.dueDate ? localDate(a.dueDate, timezone) : a.plannedDate ?? "9999-12-31";
    const bDate = b.dueDate ? localDate(b.dueDate, timezone) : b.plannedDate ?? "9999-12-31";
    return aDate.localeCompare(bDate) || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]);
  }), [scopedTasks, sort, timezone]);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const openCount = tasks.filter((task) => task.status !== "done").length;

  const selectView = (next: TaskView) => { setView(next); setStatus("all"); };
  const update = <K extends TaskEditorKey>(key: K, value: TaskDraft[K]) => onDraftChange(key, value);

  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText size={fontSizes.display} weight="bold">Tasks</AppText><AppText muted>Capture work, choose what matters, and keep it moving.</AppText></View><View style={styles.quickStats}><AppText size={12} muted>{openCount} open · {doneCount} completed</AppText></View></View>
    <AppCard style={styles.editor}>
      <View style={styles.createRow}><AppField accessibilityLabel="Task title" value={draft.title} onChangeText={(value) => update("title", value)} placeholder={editingId ? "Edit task name" : view === "today" ? "Add a task for today" : "Add a task to your inbox"} onSubmitEditing={onSubmit} returnKeyType="done" style={styles.titleInput} /><AppButton onPress={onSubmit}>{editingId ? "Save task" : "Add task"}</AppButton></View>
      <View style={styles.editorActions}><Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((value) => !value)} style={styles.detailsToggle}><AppText size={12} weight="semibold" style={{ color: colors.primary }}>{detailsOpen ? "Hide details" : "Add dates, priority & more"}</AppText></Pressable>{editingId && <Pressable onPress={() => { onReset(); setDetailsOpen(false); }} style={styles.detailsToggle}><AppText size={12} muted>Cancel edit</AppText></Pressable>}</View>
      {detailsOpen && <View style={styles.details}>
        <View style={styles.controlGroup}><AppText size={12} weight="semibold" muted>Priority</AppText><View style={styles.pills}>{(["low", "medium", "high"] as const).map((value) => <ChoicePill key={value} label={value} selected={draft.priority === value} onPress={() => update("priority", value)} />)}</View></View>
        <View style={styles.dateGrid}><AppField label="Planned date" value={draft.plannedDate} onChangeText={(value) => update("plannedDate", value)} placeholder="YYYY-MM-DD" autoCapitalize="none" /><AppField label="Due date" value={draft.dueDate} onChangeText={(value) => update("dueDate", value)} placeholder="YYYY-MM-DD" autoCapitalize="none" /><AppField label="Reminder (local time)" value={draft.reminderAt} onChangeText={(value) => update("reminderAt", value)} placeholder="YYYY-MM-DD HH:mm" autoCapitalize="none" /></View>
        <View style={styles.controlGroup}><AppText size={12} weight="semibold" muted>Repeat</AppText><View style={styles.pills}>{(["none", "daily", "weekly"] as const).map((value) => <ChoicePill key={value} label={value === "none" ? "No repeat" : value} selected={draft.recurrence === value} onPress={() => update("recurrence", value)} />)}</View></View>
        <View style={styles.controlGroup}><AppText size={12} weight="semibold" muted>Project</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}><ChoicePill label="None" selected={!draft.projectId} onPress={() => update("projectId", null)} />{projects.map((project) => <ChoicePill key={project._id} label={project.name} selected={draft.projectId === project._id} onPress={() => update("projectId", project._id)} />)}</ScrollView></View>
        <View style={styles.controlGroup}><AppText size={12} weight="semibold" muted>Subtask of</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}><ChoicePill label="None" selected={!draft.parentTaskId} onPress={() => update("parentTaskId", null)} />{tasks.filter((task) => !task.parentTask && task._id !== editingId && !task.archivedAt).map((task) => <ChoicePill key={task._id} label={task.title} selected={draft.parentTaskId === task._id} onPress={() => update("parentTaskId", task._id)} />)}</ScrollView></View>
      </View>}
      {!!error && <AppText size={12} style={{ color: colors.danger }}>{error}</AppText>}
    </AppCard>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewTabs}>{views.map((entry) => <Pressable key={entry.id} accessibilityRole="tab" accessibilityState={{ selected: view === entry.id }} onPress={() => selectView(entry.id)} style={[styles.viewTab, { backgroundColor: view === entry.id ? colors.primarySoft : "transparent" }]}><AppText size={12} weight="semibold" style={{ color: view === entry.id ? colors.primary : colors.textMuted }}>{entry.label}</AppText></Pressable>)}</ScrollView>
    <View style={styles.filters}><View style={styles.filterBlock}><AppText size={11} muted>Priority</AppText><View style={styles.pills}>{(["all", "high", "medium", "low"] as const).map((value) => <ChoicePill key={value} label={value} selected={priority === value} onPress={() => setPriority(value)} />)}</View></View>
      {view !== "completed" && view !== "archived" && <View style={styles.filterBlock}><AppText size={11} muted>Status</AppText><View style={styles.pills}>{(["all", "todo", "in_progress", "done"] as const).map((value) => <ChoicePill key={value} label={value === "all" ? "All" : value === "in_progress" ? "In progress" : value === "todo" ? "To do" : "Done"} selected={status === value} onPress={() => setStatus(value)} />)}</View></View>}
      <View style={styles.searchSort}><AppField accessibilityLabel="Search tasks" value={search} onChangeText={setSearch} placeholder="Search tasks" style={styles.searchInput} /><View style={styles.sortRow}><AppText size={11} muted>Sort</AppText>{(["due", "priority", "newest", "oldest", "title"] as const).map((value) => <Pressable key={value} onPress={() => setSort(value)} style={[styles.sortPill, { backgroundColor: sort === value ? colors.surfaceMuted : "transparent" }]}><AppText size={11} weight={sort === value ? "semibold" : "regular"} style={{ color: sort === value ? colors.text : colors.textMuted }}>{value}</AppText></Pressable>)}</View></View>
    </View>

    <View style={styles.listHeader}><SectionTitle title={views.find((entry) => entry.id === view)!.label} /><AppText size={11} muted>{view === "archived" && archivePartial ? "Showing cached archived tasks" : `${sortedTasks.length} ${sortedTasks.length === 1 ? "task" : "tasks"}`}</AppText></View>
    {view === "archived" && archivedLoading ? <AppText muted>Loading archived tasks…</AppText> : archiveError && view === "archived" ? <EmptyState title="Archived tasks unavailable" detail={archiveError} /> : sortedTasks.length ? <AppCard style={styles.listPanel}>{sortedTasks.map((task) => <TaskRow key={task._id} task={task} timezone={timezone} archived={view === "archived"} onEdit={onEdit} onToggle={onToggle} onArchive={onArchive} />)}</AppCard> : <EmptyState title={emptyTitle(view, search)} detail={emptyDetail(view)} />}
  </View>;
}

function emptyTitle(view: TaskView, search: string) {
  if (search) return "No matching tasks";
  return ({ inbox: "Inbox is clear", today: "Nothing planned for today", upcoming: "No upcoming tasks", all: "No tasks yet", completed: "No completed tasks yet", archived: "No archived tasks" })[view];
}
function emptyDetail(view: TaskView) {
  return ({ inbox: "New tasks without dates stay here until you schedule them.", today: "Plan a task or bring an upcoming item into today.", upcoming: "Tasks with future planned or due dates will appear here.", all: "Add a task above to get started.", completed: "Completed tasks will be available here for review.", archived: "Archived tasks are kept here for reference." })[view];
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.md }, headerCopy: { gap: spacing.xs }, quickStats: { paddingBottom: spacing.xs },
  editor: { padding: spacing.lg, borderRadius: radii.lg, gap: spacing.sm }, createRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }, titleInput: { flex: 1, minWidth: 180, marginTop: 0 }, editorActions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, detailsToggle: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm }, details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#8490A544", paddingTop: spacing.md, gap: spacing.md },
  controlGroup: { gap: spacing.sm }, pills: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }, dateGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  viewTabs: { gap: spacing.xs, borderBottomWidth: 1, borderColor: "#8490A544" }, viewTab: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", borderRadius: radii.md },
  filters: { gap: spacing.md }, filterBlock: { gap: spacing.xs }, searchSort: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, searchInput: { flex: 1, minWidth: 200, marginTop: 0 }, sortRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs }, sortPill: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.sm },
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, listPanel: { paddingHorizontal: spacing.md, borderRadius: radii.lg }, taskRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs }, subtaskRow: { paddingLeft: spacing.lg }, taskCheck: { width: 28, height: 28, borderRadius: radii.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, taskCopy: { flex: 1, minWidth: 0, gap: spacing.xs }, metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }, priorityDot: { width: 7, height: 7, borderRadius: radii.pill }, rowActions: { flexDirection: "row", alignItems: "center" }, actionButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
