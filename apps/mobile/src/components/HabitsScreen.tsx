import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { HabitDTO } from "@hyper-track/shared";
import { api } from "../lib/api";
import { AppButton, AppCard, AppField, AppText, ChoicePill, EmptyState, ProgressBar, SectionTitle } from "./ui";
import { fontSizes, radii, spacing, useAppTheme } from "../theme/theme";

type Habit = HabitDTO;
type HabitStats = { totalCompletions: number; completionPercent: number | null; weeklyTargetCompletionPercent: number | null; currentStreak: number | null; longestStreak: number | null; completionDates: string[]; historyCoverage: string };
export type HabitDraft = { name: string; category: string; frequency: "daily" | "weekly"; target: number; days: number[]; difficulty: "easy" | "medium" | "hard" };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shiftDate(key: string, days: number) { const date = new Date(`${key}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

function HabitGroup({ title, habits, today, stats, loading, onToggle, onEdit, onArchive }: { title: string; habits: Habit[]; today: string; stats: Record<string, HabitStats>; loading: boolean; onToggle: (habit: Habit) => void; onEdit: (habit: Habit) => void; onArchive: (habit: Habit) => void }) {
  const { colors } = useAppTheme();
  return <AppCard style={styles.group}>
    <SectionTitle title={title} action={habits.length ? `${habits.length} habits` : undefined} />
    {habits.length ? habits.map((habit) => {
      const done = habit.completions.includes(today);
      const summary = stats[habit._id];
      const recentDates = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));
      const doneLast7 = summary?.completionDates.filter((date) => date >= recentDates[0] && date <= today).length ?? 0;
      const weeklyPercent = habit.frequency === "weekly" ? Math.min(100, Math.round(doneLast7 / habit.targetPerWeek * 100)) : null;
      return <View key={habit._id} style={[styles.habitRow, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${done ? "Undo" : "Complete"} ${habit.name}`} onPress={() => onToggle(habit)} style={[styles.check, { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.successSoft : "transparent" }]}><AppText size={12} weight="bold" style={{ color: colors.success }}>{done ? "✓" : ""}</AppText></Pressable>
        <View style={styles.habitBody}>
          <View style={styles.habitTitleRow}><View style={styles.habitName}><AppText size={14} weight="semibold">{habit.icon ?? "•"}  {habit.name}</AppText><AppText size={11} muted>{habit.category ?? "Personal"} · {habit.difficulty ?? "medium"}</AppText></View><View style={styles.habitActions}><Pressable accessibilityRole="button" onPress={() => onEdit(habit)} style={styles.action}><AppText size={12} weight="semibold" style={{ color: colors.primary }}>Edit</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Archive ${habit.name}`} onPress={() => onArchive(habit)} style={styles.action}><AppText size={17} muted>×</AppText></Pressable></View></View>
          <View style={styles.scheduleLine}><AppText size={11} muted>{habit.frequency === "daily" ? "Daily" : habit.daysOfWeek?.length ? `${habit.targetPerWeek}× weekly · ${habit.daysOfWeek.map((day) => weekdays[day]).join(", ")}` : `${habit.targetPerWeek}× weekly · flexible days`}</AppText>{habit.frequency === "weekly" && <AppText size={11} weight="semibold" style={{ color: colors.primary }}>{doneLast7}/{habit.targetPerWeek} in last 7 days</AppText>}</View>
          {habit.frequency === "weekly" && <ProgressBar value={weeklyPercent ?? 0} />}
          <View style={styles.history} accessibilityLabel="Completion history for the last seven days">{recentDates.map((date) => { const completed = summary?.completionDates.includes(date) ?? false; const label = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }); return <View key={date} style={styles.historyDay}><View style={[styles.historyDot, { backgroundColor: completed ? colors.success : colors.surfaceMuted }]} /><AppText size={9} muted>{label.slice(0, 1)}</AppText></View>; })}</View>
          <View style={styles.streakLine}><AppText size={11} muted>{loading && !summary ? "Loading history…" : `Current streak ${summary?.currentStreak ?? "—"}`}</AppText><AppText size={11} muted>{summary?.longestStreak === null ? "Flexible schedule · streak not defined" : `Longest ${summary?.longestStreak ?? "—"}`}</AppText>{summary?.completionPercent !== null && summary?.completionPercent !== undefined && <AppText size={11} muted>{summary.completionPercent}% scheduled this month</AppText>}</View>
        </View>
      </View>;
    }) : <EmptyState title="No habits in this group" detail="Add a small repeatable action to start building consistency." />}
  </AppCard>;
}

export function HabitsScreen({ habits, today, timezone, draft, editingId, error, onDraftChange, onSave, onCancelEdit, onToggle, onArchive, onEdit }: {
  habits: Habit[]; today: string; timezone: string; draft: HabitDraft; editingId: string | null; error: string;
  onDraftChange: (key: keyof HabitDraft, value: HabitDraft[keyof HabitDraft]) => void; onSave: () => void; onCancelEdit: () => void;
  onToggle: (habit: Habit) => void; onArchive: (habit: Habit) => void; onEdit: (habit: Habit) => void;
}) {
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<"all" | "daily" | "weekly">("all");
  const [stats, setStats] = useState<Record<string, HabitStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const from = `${today.slice(0, 7)}-01`;
  useEffect(() => {
    let active = true;
    if (!habits.length) { setStats({}); setStatsLoading(false); return () => { active = false; }; }
    setStatsLoading(true);
    void Promise.all(habits.map(async (habit) => {
      try {
        const value = await api<HabitStats>(`/habits/${habit._id}/analytics?from=${from}&to=${today}`);
        return [habit._id, value] as const;
      } catch { return null; }
    })).then((rows) => { if (active) setStats(Object.fromEntries(rows.filter((row): row is NonNullable<typeof row> => row !== null))); })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [habits, today, timezone, from]);
  const daily = useMemo(() => habits.filter((habit) => habit.frequency === "daily" && (filter === "all" || filter === "daily")), [habits, filter]);
  const weekly = useMemo(() => habits.filter((habit) => habit.frequency === "weekly" && (filter === "all" || filter === "weekly")), [habits, filter]);
  const totalDone = habits.filter((habit) => habit.completions.includes(today)).length;
  const update = <K extends keyof HabitDraft>(key: K, value: HabitDraft[K]) => onDraftChange(key, value);

  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText size={fontSizes.display} weight="bold">Habits</AppText><AppText muted>Build consistency through small, repeatable actions.</AppText></View><AppText size={13} weight="semibold">{totalDone} checked in today</AppText></View>
    <AppCard style={styles.editor}><View style={styles.editorRow}><AppField label="Habit" accessibilityLabel="Habit name" value={draft.name} onChangeText={(value) => update("name", value)} placeholder={editingId ? "Edit habit" : "Add a habit"} onSubmitEditing={onSave} style={styles.nameInput} /><AppField label="Category" accessibilityLabel="Habit category" value={draft.category} onChangeText={(value) => update("category", value)} placeholder="Personal" style={styles.categoryInput} /><AppButton onPress={onSave}>{editingId ? "Save habit" : "Add habit"}</AppButton>{editingId && <AppButton variant="quiet" onPress={onCancelEdit}>Cancel</AppButton>}</View>
      <View style={styles.editorOptions}><View style={styles.optionGroup}><AppText size={11} muted>Schedule</AppText><View style={styles.pills}>{(["daily", "weekly"] as const).map((value) => <ChoicePill key={value} label={value} selected={draft.frequency === value} onPress={() => update("frequency", value)} />)}</View></View>
        {draft.frequency === "weekly" && <><View style={styles.targetGroup}><AppText size={11} muted>Weekly target</AppText><View style={styles.targetControl}><Pressable accessibilityRole="button" accessibilityLabel="Decrease weekly target" onPress={() => update("target", Math.max(1, draft.target - 1))} style={[styles.targetButton, { borderColor: colors.border }]}><AppText>−</AppText></Pressable><AppText size={15} weight="bold">{draft.target}</AppText><Pressable accessibilityRole="button" accessibilityLabel="Increase weekly target" onPress={() => update("target", Math.min(7, draft.target + 1))} style={[styles.targetButton, { borderColor: colors.border }]}><AppText>+</AppText></Pressable><AppText size={11} muted>per week</AppText></View></View>
          <View style={styles.optionGroup}><AppText size={11} muted>Preferred weekdays · optional</AppText><View style={styles.pills}>{weekdays.map((label, day) => <ChoicePill key={label} label={label} selected={draft.days.includes(day)} onPress={() => { const next = draft.days.includes(day) ? draft.days.filter((item) => item !== day) : [...draft.days, day].sort(); update("days", next); if (next.length) update("target", next.length); }} />)}</View></View></>}
        <View style={styles.optionGroup}><AppText size={11} muted>Effort</AppText><View style={styles.pills}>{(["easy", "medium", "hard"] as const).map((value) => <ChoicePill key={value} label={value} selected={draft.difficulty === value} onPress={() => update("difficulty", value)} />)}</View></View>
      </View>{!!error && <AppText size={12} style={{ color: colors.danger }}>{error}</AppText>}
    </AppCard>
    <View style={[styles.filters, { borderBottomColor: colors.border }]}>{(["all", "daily", "weekly"] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { borderBottomColor: filter === value ? colors.primary : "transparent" }]}><AppText size={12} weight="semibold" style={{ color: filter === value ? colors.primary : colors.textMuted }}>{value === "all" ? "All habits" : `${value[0].toUpperCase()}${value.slice(1)} habits`}</AppText></Pressable>)}</View>
    {filter !== "weekly" && <HabitGroup title="Daily habits" habits={daily} today={today} stats={stats} loading={statsLoading} onToggle={onToggle} onEdit={onEdit} onArchive={onArchive} />}
    {filter !== "daily" && <HabitGroup title="Weekly habits" habits={weekly} today={today} stats={stats} loading={statsLoading} onToggle={onToggle} onEdit={onEdit} onArchive={onArchive} />}
    {Object.values(stats).some((item) => item.historyCoverage === "partial-before-completion-history-migration") && <AppText size={11} muted>Habit history may be partial before the completion-history rollout.</AppText>}
  </View>;
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.md }, headerCopy: { gap: spacing.xs },
  editor: { padding: spacing.lg, borderRadius: radii.lg, gap: spacing.md }, editorRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.sm }, nameInput: { flex: 1, minWidth: 190, marginTop: 0 }, categoryInput: { width: 180, marginTop: 0 }, editorOptions: { gap: spacing.md }, optionGroup: { gap: spacing.xs }, pills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }, targetGroup: { gap: spacing.xs }, targetControl: { flexDirection: "row", alignItems: "center", gap: spacing.md }, targetButton: { width: 44, height: 40, borderWidth: 1, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", borderBottomWidth: 1 }, filter: { minHeight: 46, paddingHorizontal: spacing.md, justifyContent: "center", borderBottomWidth: 2 }, group: { padding: spacing.lg, borderRadius: radii.lg }, habitRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth }, check: { width: 28, height: 28, borderWidth: 1.5, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", marginTop: spacing.xs }, habitBody: { flex: 1, minWidth: 0, gap: spacing.xs }, habitTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }, habitName: { flex: 1, gap: 2 }, habitActions: { flexDirection: "row" }, action: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }, scheduleLine: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.xs }, history: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xs }, historyDay: { alignItems: "center", gap: 2 }, historyDot: { width: 10, height: 10, borderRadius: radii.pill }, streakLine: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
});
