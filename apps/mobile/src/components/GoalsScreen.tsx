import { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import type { GoalDTO } from "@hyper-track/shared";
import { AppButton, AppCard, AppField, AppText, EmptyState, ProgressBar, SectionTitle } from "./ui";
import { fontSizes, radii, spacing, useAppTheme } from "../theme/theme";

function localDate(value: string, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function GoalsScreen({ goals, timezone, title, targetDate, editingId, newMilestone, milestoneGoalId, error, onTitleChange, onTargetDateChange, onMilestoneChange, onSave, onCancelEdit, onEdit, onToggleGoal, onArchive, onAddMilestone, onSelectMilestoneGoal, onToggleMilestone }: {
  goals: GoalDTO[]; timezone: string; title: string; targetDate: string; editingId: string | null; newMilestone: string; milestoneGoalId: string | null; error: string;
  onTitleChange: (value: string) => void; onTargetDateChange: (value: string) => void; onMilestoneChange: (value: string) => void; onSave: () => void; onCancelEdit: () => void;
  onEdit: (goal: GoalDTO) => void; onToggleGoal: (goal: GoalDTO) => void; onArchive: (goal: GoalDTO) => void; onAddMilestone: (goalId: string) => void;
  onSelectMilestoneGoal: (goalId: string | null) => void; onToggleMilestone: (goal: GoalDTO, milestone: GoalDTO["milestones"][number]) => void;
}) {
  const { colors } = useAppTheme();
  const wide = useWindowDimensions().width >= 760;
  const [showCompleted, setShowCompleted] = useState(false);
  const visible = goals.filter((goal) => (goal.status === "completed") === showCompleted);

  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText size={fontSizes.display} weight="bold">Goals</AppText><AppText muted>Keep long-term outcomes visible and break them into milestones.</AppText></View><AppText size={12} muted>{goals.filter((goal) => goal.status === "active").length} active · {goals.filter((goal) => goal.status === "completed").length} complete</AppText></View>
    <AppCard style={styles.editor}><View style={styles.editorRow}><AppField label="Goal" accessibilityLabel="Goal title" value={title} onChangeText={onTitleChange} placeholder={editingId ? "Edit goal title" : "What outcome matters?"} onSubmitEditing={onSave} style={styles.editorInput} /><AppField label="Target date" accessibilityLabel="Goal target date" value={targetDate} onChangeText={onTargetDateChange} placeholder="YYYY-MM-DD" autoCapitalize="none" style={styles.dateInput} /><AppButton onPress={onSave}>{editingId ? "Save goal" : "Add goal"}</AppButton>{editingId && <AppButton variant="quiet" onPress={onCancelEdit}>Cancel</AppButton>}</View>{!!error && <AppText size={12} style={{ color: colors.danger }}>{error}</AppText>}</AppCard>
    <View style={[styles.explainer, { backgroundColor: colors.primarySoft }]}><AppText size={12} style={{ color: colors.primary }}>Goals define outcomes and milestones. Projects group the tasks that move work forward; assign tasks to projects from Tasks to track delivery.</AppText></View>
    <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>{([false, true] as const).map((completed) => <Pressable key={String(completed)} accessibilityRole="tab" accessibilityState={{ selected: showCompleted === completed }} onPress={() => setShowCompleted(completed)} style={[styles.filter, { borderBottomColor: showCompleted === completed ? colors.primary : "transparent" }]}><AppText size={13} weight="semibold" style={{ color: showCompleted === completed ? colors.primary : colors.textMuted }}>{completed ? "Completed" : "Active"}</AppText></Pressable>)}</View>
    {visible.length ? <View style={styles.grid}>{visible.map((goal) => {
      const completed = goal.milestones.filter((milestone) => !!milestone.completedAt).length;
      const progress = goal.milestones.length ? Math.round(completed / goal.milestones.length * 100) : 0;
      return <AppCard key={goal._id} style={[styles.goal, wide ? styles.goalWide : undefined]}>
        <View style={styles.goalHeading}><View style={styles.goalTitle}><AppText size={18} weight="bold">{goal.title}</AppText><AppText size={11} muted>{goal.targetDate ? `Target ${localDate(goal.targetDate, timezone)}` : "No target date"} · {goal.status}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel={`Archive ${goal.title}`} onPress={() => onArchive(goal)} style={styles.iconAction}><AppText size={18} muted>×</AppText></Pressable></View>
        <View style={styles.progressLabel}><AppText size={12} muted>Milestone progress</AppText><AppText size={12} weight="semibold">{completed} / {goal.milestones.length}</AppText></View><ProgressBar value={progress} color={goal.status === "completed" ? colors.success : colors.primary} />
        <View style={[styles.milestones, { borderTopColor: colors.border }]}><SectionTitle title="Milestones" />{goal.milestones.length ? goal.milestones.map((milestone) => {
          const done = !!milestone.completedAt;
          return <Pressable key={milestone._id} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${done ? "Reopen" : "Complete"} ${milestone.title}`} onPress={() => onToggleMilestone(goal, milestone)} style={styles.milestoneRow}>
            <View style={[styles.check, { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.successSoft : "transparent" }]}><AppText size={12} weight="bold" style={{ color: colors.success }}>{done ? "✓" : ""}</AppText></View><AppText size={13} style={done ? { color: colors.textMuted, textDecorationLine: "line-through" } : undefined}>{milestone.title}</AppText>
          </Pressable>;
        }) : <AppText size={12} muted>Add milestones to make progress visible.</AppText>}
          {milestoneGoalId === goal._id ? <View style={styles.addMilestone}><AppField accessibilityLabel="Milestone title" value={newMilestone} onChangeText={onMilestoneChange} placeholder="Milestone name" onSubmitEditing={() => onAddMilestone(goal._id)} style={styles.milestoneInput} /><AppButton onPress={() => onAddMilestone(goal._id)}>Add</AppButton><AppButton variant="quiet" onPress={() => onSelectMilestoneGoal(null)}>Cancel</AppButton></View> : <Pressable accessibilityRole="button" onPress={() => onSelectMilestoneGoal(goal._id)} style={styles.addLink}><AppText size={12} weight="semibold" style={{ color: colors.primary }}>+ Add milestone</AppText></Pressable>}
        </View>
        <View style={styles.actions}><AppButton variant="secondary" onPress={() => onEdit(goal)}>Edit</AppButton><AppButton variant="quiet" onPress={() => onToggleGoal(goal)}>{goal.status === "active" ? "Mark complete" : "Reopen goal"}</AppButton></View>
      </AppCard>;
    })}</View> : <EmptyState title={showCompleted ? "No completed goals" : "No active goals"} detail={showCompleted ? "Completed outcomes will remain here for reference." : "Start with one outcome that would make this season meaningful."} />}
  </View>;
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.md }, headerCopy: { gap: spacing.xs },
  editor: { padding: spacing.lg, borderRadius: radii.lg, gap: spacing.sm }, editorRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.sm }, editorInput: { flex: 1, minWidth: 200, marginTop: 0 }, dateInput: { width: 160, marginTop: 0 }, explainer: { padding: spacing.md, borderRadius: radii.md },
  filterRow: { flexDirection: "row", borderBottomWidth: 1 }, filter: { minHeight: 46, paddingHorizontal: spacing.md, justifyContent: "center", borderBottomWidth: 2 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, goal: { width: "100%", padding: spacing.lg, borderRadius: radii.lg, gap: spacing.md }, goalWide: { width: "48.8%" },
  goalHeading: { flexDirection: "row", gap: spacing.sm }, goalTitle: { flex: 1, gap: spacing.xs }, iconAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, progressLabel: { flexDirection: "row", justifyContent: "space-between" }, milestones: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.xs }, milestoneRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm }, check: { width: 22, height: 22, borderWidth: 1.5, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" }, addMilestone: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, milestoneInput: { flex: 1, minWidth: 140, marginTop: 0 }, addLink: { minHeight: 44, justifyContent: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }
});
