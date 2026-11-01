import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import type { TaskDTO, ProjectDTO } from "@hyper-track/shared";
import { AppButton, AppCard, AppField, AppText, EmptyState, ProgressBar, SectionTitle } from "./ui";
import { fontSizes, radii, spacing, useAppTheme } from "../theme/theme";

type Project = ProjectDTO & { description?: string };
type Task = Omit<TaskDTO, "project"> & { project?: { _id: string; name: string } | null };
function localDate(value: string, timezone: string) {
  const date = new Date(value); const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function ProjectsScreen({ projects, tasks, timezone, today, editingId, name, onNameChange, onSave, onCancelEdit, onEdit, onStatusChange, onArchive, error }: {
  projects: Project[]; tasks: Task[]; timezone: string; today: string; editingId: string | null; name: string; onNameChange: (name: string) => void; onSave: () => void; onCancelEdit: () => void;
  onEdit: (project: Project) => void; onStatusChange: (project: Project, status: "active" | "completed") => void; onArchive: (project: Project) => void; error: string;
}) {
  const { colors } = useAppTheme();
  const wide = useWindowDimensions().width >= 760;
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const visible = useMemo(() => projects.filter((project) => project.status === filter), [projects, filter]);
  const activeCount = projects.filter((project) => project.status === "active").length;
  const completedCount = projects.filter((project) => project.status === "completed").length;

  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText size={fontSizes.display} weight="bold">Projects</AppText><AppText muted>See the outcomes you're moving forward and the tasks behind them.</AppText></View><View style={styles.totals}><AppText size={13} weight="semibold">{activeCount} active</AppText><AppText size={12} muted>{completedCount} completed</AppText></View></View>
    <View style={styles.createRow}><AppField accessibilityLabel="Project name" value={name} onChangeText={onNameChange} placeholder={editingId ? "Edit project name" : "Name a new project"} onSubmitEditing={onSave} returnKeyType="done" style={styles.nameInput} /><AppButton onPress={onSave}>{editingId ? "Save project" : "Create project"}</AppButton>{editingId && <AppButton variant="quiet" onPress={onCancelEdit}>Cancel</AppButton>}</View>
    {!!error && <AppText size={12} style={{ color: colors.danger }}>{error}</AppText>}
    <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>{(["active", "completed"] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { borderBottomColor: filter === value ? colors.primary : "transparent" }]}><AppText size={13} weight="semibold" style={{ color: filter === value ? colors.primary : colors.textMuted }}>{value === "active" ? `Active · ${activeCount}` : `Completed · ${completedCount}`}</AppText></Pressable>)}</View>
    {visible.length ? <View style={styles.grid}>{visible.map((project) => {
      const associated = tasks.filter((task) => task.project?._id === project._id);
      const completed = associated.filter((task) => task.status === "done").length;
      const progress = associated.length ? Math.round(completed / associated.length * 100) : 0;
      const openTasks = associated.filter((task) => task.status !== "done");
      const overdue = openTasks.filter((task) => task.dueDate && localDate(task.dueDate, timezone) < today).length;
      const nextDeadline = openTasks.filter((task) => task.dueDate).map((task) => localDate(task.dueDate!, timezone)).sort()[0];
      return <AppCard key={project._id} style={[styles.project, wide ? styles.projectWide : undefined]}>
        <View style={styles.projectHeader}><View style={styles.projectTitle}><AppText size={18} weight="bold">{project.name}</AppText><View style={[styles.status, { backgroundColor: project.status === "active" ? colors.primarySoft : colors.successSoft }]}><AppText size={10} weight="semibold" style={{ color: project.status === "active" ? colors.primary : colors.success }}>{project.status}</AppText></View></View><Pressable accessibilityRole="button" accessibilityLabel={`Archive ${project.name}`} onPress={() => onArchive(project)} style={styles.archiveAction}><AppText size={18} muted>×</AppText></Pressable></View>
        <View style={styles.progressHeading}><AppText size={12} muted>Current task progress</AppText><AppText size={12} weight="semibold">{completed} / {associated.length}</AppText></View><ProgressBar value={progress} />
        <View style={styles.stats}><AppText size={11} muted>{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</AppText><AppText size={11} style={{ color: overdue ? colors.danger : colors.textMuted }}>{overdue} overdue</AppText><AppText size={11} muted>{nextDeadline ? `Next due ${nextDeadline}` : "No upcoming deadline"}</AppText></View>
        <View style={[styles.taskPreview, { borderTopColor: colors.border }]}><SectionTitle title="Associated tasks" />{associated.length ? associated.slice(0, 3).map((task) => <View key={task._id} style={styles.taskLine}><AppText size={12} style={task.status === "done" ? { color: colors.textMuted, textDecorationLine: "line-through" } : undefined}>{task.status === "done" ? "✓" : "○"}  {task.title}</AppText></View>) : <AppText size={12} muted>No tasks assigned yet.</AppText>}{associated.length > 3 && <AppText size={11} muted>and {associated.length - 3} more</AppText>}</View>
        <View style={styles.actions}><AppButton variant="secondary" onPress={() => onEdit(project)}>Rename</AppButton><AppButton variant={project.status === "active" ? "quiet" : "secondary"} onPress={() => onStatusChange(project, project.status === "active" ? "completed" : "active")}>{project.status === "active" ? "Mark complete" : "Reopen"}</AppButton></View>
      </AppCard>;
    })}</View> : <EmptyState title={filter === "active" ? "No active projects" : "No completed projects"} detail={filter === "active" ? "Create a project to group related tasks and track progress." : "Completed projects stay here for reference."} />}
    <AppText size={11} muted style={styles.footnote}>Progress is based on the current status of assigned tasks. Project completion status is set separately.</AppText>
  </View>;
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap" }, headerCopy: { gap: spacing.xs }, totals: { alignItems: "flex-end", gap: spacing.xs },
  createRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }, nameInput: { flex: 1, minWidth: 190, marginTop: 0 },
  filterBar: { flexDirection: "row", borderBottomWidth: 1 }, filter: { paddingHorizontal: spacing.md, minHeight: 46, justifyContent: "center", borderBottomWidth: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, project: { width: "100%", padding: spacing.lg, borderRadius: radii.lg, gap: spacing.md }, projectWide: { width: "48.8%" }, projectHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }, projectTitle: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }, status: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.pill }, archiveAction: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  progressHeading: { flexDirection: "row", justifyContent: "space-between" }, stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, taskPreview: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.sm }, taskLine: { minHeight: 24 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, footnote: { marginTop: spacing.xs }
});
