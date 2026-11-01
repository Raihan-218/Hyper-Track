import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { api } from "../lib/api";
import type { TaskRecord } from "./TaskManagementScreen";
import { AppButton, AppCard, AppText, EmptyState, ProgressBar } from "./ui";
import { fontSizes, radii, spacing, useAppTheme } from "../theme/theme";

type CalendarMode = "month" | "week" | "day";
type DaySummary = { plannedTasks: number; completedTasks: number; completedHabits: number; scheduledHabits: number };
type CalendarRange = { days: Record<string, DaySummary>; historyCoverage: string };
type PlannedTask = { task: string; title: string; priority: "low" | "medium" | "high"; status: "todo" | "done" };
type Completion = { task: string; title: string; priority: string; reversedAt?: string | null };
type HabitEvent = { habit: string; name: string; reversedAt?: string | null };
type DayDetail = { date: string; isFuture: boolean; plannedTasks: PlannedTask[]; completedTasks: Completion[]; pendingTasks: PlannedTask[]; scheduledHabits: Array<{ _id: string; name: string }>; completedHabits: HabitEvent[]; reversedHabitCompletions: HabitEvent[]; habitCompletionPercent: number | null; xpEarned: number | null; historyCoverage: string };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const modes: CalendarMode[] = ["month", "week", "day"];
function shiftDate(key: string, amount: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function monthBounds(key: string) { const year = Number(key.slice(0, 4)); const month = Number(key.slice(5, 7)); return { from: `${key.slice(0, 7)}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) }; }
function formatDate(key: string, options: Intl.DateTimeFormatOptions) { return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: "UTC" }); }
function taskDate(value: string, timezone: string) { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }

export function CalendarScreen({ today, timezone, tasks, initialDate, onDateChange, onCreateTask, onEditTask, onToggleTask, onOpenProject }: {
  today: string; timezone: string; tasks: TaskRecord[]; initialDate: string; onDateChange: (date: string) => void; onCreateTask: (date: string) => void;
  onEditTask: (task: TaskRecord) => void; onToggleTask: (task: TaskRecord) => Promise<void>; onOpenProject: () => void;
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [mode, setMode] = useState<CalendarMode>("month");
  const [selectedDate, setSelectedDate] = useState(initialDate || today);
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const bounds = useMemo(() => monthBounds(selectedDate), [selectedDate]);
  const calendarBounds = useMemo(() => {
    const first = new Date(`${bounds.from}T12:00:00Z`).getUTCDay();
    const last = new Date(`${bounds.to}T12:00:00Z`).getUTCDay();
    return { from: shiftDate(bounds.from, -first), to: shiftDate(bounds.to, 6 - last) };
  }, [bounds]);
  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true); setError(""); setDetail(null); setRange(null);
    try {
      const [month, day] = await Promise.all([
        api<CalendarRange>(`/calendar?from=${calendarBounds.from}&to=${calendarBounds.to}`),
        api<DayDetail>(`/calendar/day/${selectedDate}`)
      ]);
      if (request === requestId.current) { setRange(month); setDetail(day); }
    } catch (cause) { if (request === requestId.current) setError(cause instanceof Error ? cause.message : "Calendar data is unavailable."); }
    finally { if (request === requestId.current) setLoading(false); }
  }, [calendarBounds.from, calendarBounds.to, selectedDate]);
  useEffect(() => { void refresh(); }, [refresh]);

  const datesInWeek = useMemo(() => {
    const day = new Date(`${selectedDate}T12:00:00Z`).getUTCDay();
    const start = shiftDate(selectedDate, -day);
    return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  }, [selectedDate]);
  const monthDays = useMemo(() => {
    const first = new Date(`${bounds.from}T12:00:00Z`);
    const offset = first.getUTCDay(); const count = new Date(Date.UTC(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)), 0)).getUTCDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, index) => `${selectedDate.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`)];
  }, [bounds.from, selectedDate]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task._id, task])), [tasks]);
  const deadlinesByDate = useMemo(() => {
    const result = new Map<string, number>();
    for (const task of tasks) if (task.dueDate) { const date = taskDate(task.dueDate, timezone); if (date >= today) result.set(date, (result.get(date) ?? 0) + 1); }
    return result;
  }, [tasks, timezone, today]);
  const deadlines = useMemo(() => selectedDate < today ? [] : tasks.filter((task) => task.dueDate && taskDate(task.dueDate, timezone) === selectedDate), [tasks, timezone, selectedDate, today]);
  const overdue = useMemo(() => tasks.filter((task) => task.status !== "done" && task.dueDate && taskDate(task.dueDate, timezone) < today), [tasks, timezone, today]);
  useEffect(() => { setSelectedDate(initialDate); }, [initialDate]);
  const goTo = (date: string) => { setSelectedDate(date); onDateChange(date); };
  const navigate = (direction: -1 | 1) => {
    if (mode === "month") {
      const current = new Date(`${selectedDate}T12:00:00Z`); const day = current.getUTCDate(); current.setUTCDate(1); current.setUTCMonth(current.getUTCMonth() + direction);
      const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate(); current.setUTCDate(Math.min(day, lastDay)); goTo(current.toISOString().slice(0, 10));
    } else goTo(shiftDate(selectedDate, direction * (mode === "week" ? 7 : 1)));
  };
  const header = mode === "month" ? formatDate(`${selectedDate.slice(0, 7)}-15`, { month: "long", year: "numeric" }) : mode === "week" ? `${formatDate(datesInWeek[0], { month: "short", day: "numeric" })} – ${formatDate(datesInWeek[6], { month: "short", day: "numeric", year: "numeric" })}` : formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const summary = range?.days[selectedDate];
  const matchedForTask = (id: string) => taskById.get(id);
  const canMutate = selectedDate === today && !detail?.isFuture;

  const dateSelector = (date: string, compact = false) => {
    const selected = date === selectedDate; const isToday = date === today; const item = range?.days[date]; const dueCount = deadlinesByDate.get(date) ?? 0;
    return <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${formatDate(date, { weekday: "long", month: "long", day: "numeric" })}${isToday ? ", today" : ""}${item ? `, ${item.plannedTasks} planned tasks, ${item.completedTasks} completed, ${item.completedHabits} habits` : ""}`} onPress={() => goTo(date)} style={[compact ? styles.dateChip : styles.monthCell, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, minHeight: compact ? 58 : 76 }]}>
      <View style={styles.dateCellTop}><AppText size={compact ? 12 : 13} weight={selected || isToday ? "bold" : "medium"} style={{ color: selected ? colors.primary : isToday ? colors.success : colors.text }}>{formatDate(date, compact ? { weekday: "short", day: "numeric" } : { day: "numeric" })}</AppText>{isToday && <View style={[styles.todayMark, { backgroundColor: colors.success }]} />}</View>
      {!compact && <View style={styles.markers}><AppText size={9} muted>{item?.plannedTasks ? `${item.plannedTasks} task${item.plannedTasks === 1 ? "" : "s"}` : ""}</AppText><AppText size={9} muted>{item?.scheduledHabits ? `${item.completedHabits}/${item.scheduledHabits} habits` : ""}</AppText><View style={styles.dots}>{item?.plannedTasks ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}{item?.completedTasks ? <View style={[styles.dot, { backgroundColor: colors.success }]} /> : null}{item?.scheduledHabits ? <View style={[styles.dot, { backgroundColor: colors.warning }]} /> : null}{dueCount ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}</View></View>}
      {compact && <><AppText size={9} muted>{item ? `${item.plannedTasks}·${item.completedTasks}` : "—"}</AppText><AppText size={9} muted>{item?.scheduledHabits ? `${item.completedHabits}/${item.scheduledHabits}h` : ""}</AppText><View style={styles.dots}>{item?.plannedTasks ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}{item?.completedTasks ? <View style={[styles.dot, { backgroundColor: colors.success }]} /> : null}{item?.scheduledHabits ? <View style={[styles.dot, { backgroundColor: colors.warning }]} /> : null}{dueCount ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}</View></>}
    </Pressable>;
  };

  const taskLine = (item: PlannedTask | Completion, status: "planned" | "completed" | "overdue") => {
    const task = matchedForTask(item.task); const complete = status === "completed" || ("status" in item && item.status === "done");
    return <View key={`${item.task}-${status}`} style={[styles.agendaRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.eventRail, { backgroundColor: status === "overdue" ? colors.danger : complete ? colors.success : colors.primary }]} />
      <View style={styles.agendaCopy}><AppText size={13} weight="semibold" style={complete ? { color: colors.textMuted, textDecorationLine: "line-through" } : undefined}>{item.title}</AppText><AppText size={11} muted>{status === "overdue" ? "Overdue deadline" : status === "completed" ? "Completed" : `Planned · ${item.priority} priority`}{task?.project?.name ? ` · ${task.project.name}` : ""}</AppText></View>
      {task?.project && <Pressable accessibilityRole="button" accessibilityLabel={`Open project ${task.project.name}`} onPress={onOpenProject} style={styles.smallAction}><AppText size={11} weight="semibold" style={{ color: colors.primary }}>Project</AppText></Pressable>}
      {task && canMutate && <><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={() => onEditTask(task)} style={styles.smallAction}><AppText size={11} weight="semibold" style={{ color: colors.primary }}>Edit</AppText></Pressable><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.status === "done" }} accessibilityLabel={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`} onPress={() => { void onToggleTask(task).then(refresh); }} style={[styles.check, { borderColor: complete ? colors.success : colors.border, backgroundColor: complete ? colors.successSoft : "transparent" }]}><AppText size={11} weight="bold" style={{ color: colors.success }}>{complete ? "✓" : ""}</AppText></Pressable></>}</View>;
  };

  const agenda = <View style={styles.agenda}>
    <View style={styles.agendaHeading}><View><AppText size={18} weight="bold">{formatDate(selectedDate, { weekday: "long" })}</AppText><AppText size={12} muted>{selectedDate === today ? "Today" : formatDate(selectedDate, { month: "long", day: "numeric", year: "numeric" })}</AppText></View><AppButton onPress={() => onCreateTask(selectedDate)}>+ Task</AppButton></View>
    {error ? <EmptyState title="Calendar unavailable" detail={error} /> : loading && !detail ? <AppText muted>Loading calendar…</AppText> : !detail ? null : <>
      {!detail.isFuture && <View style={styles.daySummary}><View style={styles.summaryStats}><AppText size={12} weight="semibold">{detail.plannedTasks.filter((task) => task.status === "done").length} / {detail.plannedTasks.length} tasks</AppText><AppText size={12} muted>{detail.habitCompletionPercent ?? 0}% habits</AppText>{detail.xpEarned !== null && <AppText size={12} muted>{detail.xpEarned} XP</AppText>}</View><ProgressBar value={detail.plannedTasks.length ? detail.plannedTasks.filter((task) => task.status === "done").length / detail.plannedTasks.length * 100 : 0} /></View>}
      <View style={styles.agendaSection}><AppText size={11} weight="bold" muted>PLANNED TASKS</AppText>{detail.plannedTasks.length ? detail.plannedTasks.map((item) => taskLine(item, item.status === "done" ? "completed" : "planned")) : <AppText size={12} muted style={styles.emptyInline}>No tasks planned for this date.</AppText>}</View>
      {selectedDate === today && overdue.length > 0 && <View style={styles.agendaSection}><AppText size={11} weight="bold" style={{ color: colors.danger }}>OVERDUE · {overdue.length}</AppText>{overdue.map((task) => taskLine({ task: task._id, title: task.title, priority: task.priority }, "overdue"))}</View>}
      <View style={styles.agendaSection}><AppText size={11} weight="bold" muted>COMPLETION RECORDS</AppText>{detail.completedTasks.length ? detail.completedTasks.map((event) => <View key={`${event.task}-${event.reversedAt ?? "done"}`} style={styles.recordRow}><AppText size={12} style={{ color: event.reversedAt ? colors.textMuted : colors.success }}>{event.reversedAt ? "↶" : "✓"}</AppText><AppText size={12} style={{ flex: 1, color: event.reversedAt ? colors.textMuted : colors.text }}>{event.title}{event.reversedAt ? " · later reversed" : ""}</AppText></View>) : <AppText size={12} muted style={styles.emptyInline}>No recorded task completions.</AppText>}</View>
      {deadlines.length > 0 && <View style={styles.agendaSection}><AppText size={11} weight="bold" style={{ color: colors.warning }}>DEADLINES · {deadlines.length}</AppText>{deadlines.map((task) => <View key={task._id} style={styles.recordRow}><AppText size={12} style={{ color: colors.warning }}>◆</AppText><AppText size={12} style={{ flex: 1 }}>{task.title}{task.status === "done" ? " · complete" : ""}</AppText></View>)}</View>}
      <View style={styles.agendaSection}><AppText size={11} weight="bold" muted>HABITS</AppText>{detail.scheduledHabits.length ? detail.scheduledHabits.map((habit) => { const done = detail.completedHabits.some((event) => event.habit === habit._id && !event.reversedAt); return <View key={habit._id} style={styles.recordRow}><AppText size={12} style={{ color: done ? colors.success : colors.primary }}>{done ? "✓" : "○"}</AppText><AppText size={12} style={{ flex: 1 }}>{habit.name}</AppText><AppText size={11} muted>{done ? "Complete" : "Scheduled"}</AppText></View>; }) : <AppText size={12} muted style={styles.emptyInline}>No habits scheduled.</AppText>}</View>
      {detail.reversedHabitCompletions.length > 0 && <View style={styles.agendaSection}><AppText size={11} weight="bold" muted>REVERSED CHECK-INS</AppText>{detail.reversedHabitCompletions.map((event, index) => <View key={`${event.habit}-${index}`} style={styles.recordRow}><AppText size={12} muted>↶</AppText><AppText size={12} muted>{event.name}</AppText></View>)}</View>}
      {selectedDate <= today && detail.historyCoverage !== "complete" && <AppText size={10} muted style={styles.coverage}>Older migrated history may be partial.</AppText>}
    </>}
  </View>;

  return <View style={styles.page}>
    <View style={styles.header}><View style={styles.headerCopy}><AppText size={fontSizes.display} weight="bold">Calendar</AppText><AppText muted>Plan your days and review what actually happened.</AppText></View><AppButton variant="secondary" onPress={() => goTo(today)}>Today</AppButton></View>
    <View style={styles.toolbar}><View style={styles.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Previous date range" onPress={() => navigate(-1)} style={[styles.navArrow, { borderColor: colors.border }]}><AppText size={20}>‹</AppText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Next date range" onPress={() => navigate(1)} style={[styles.navArrow, { borderColor: colors.border }]}><AppText size={20}>›</AppText></Pressable><AppText size={19} weight="bold" style={styles.rangeTitle}>{header}</AppText></View><View style={styles.modeSwitch}>{modes.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.modeButton, { backgroundColor: mode === item ? colors.primarySoft : "transparent" }]}><AppText size={12} weight="semibold" style={{ color: mode === item ? colors.primary : colors.textMuted }}>{item}</AppText></Pressable>)}</View></View>
    {error && <AppText size={12} style={{ color: colors.danger }}>{error}</AppText>}
    <View style={[styles.body, wide && styles.bodyWide]}>
      <View style={[styles.calendarPane, wide && styles.calendarPaneWide]}>
      {mode === "month" && <><View style={styles.monthGrid}>{weekdays.map((day) => <AppText key={day} size={10} weight="bold" muted style={styles.weekday}>{day}</AppText>)}{monthDays.map((date, index) => date ? dateSelector(date) : <View key={`blank-${index}`} style={styles.monthCellBlank} />)}</View><View style={styles.legend}><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.primary }]} /><AppText size={10} muted>Planned</AppText></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.success }]} /><AppText size={10} muted>Completed</AppText></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.warning }]} /><AppText size={10} muted>Habits</AppText></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.danger }]} /><AppText size={10} muted>Current deadlines</AppText></View><AppText size={10} muted>{summary ? `${summary.plannedTasks} tasks · ${summary.completedTasks} complete · ${summary.scheduledHabits} habits` : "Select a day for details"}</AppText></View></>}
        {mode === "week" && <><View style={styles.weekStrip}>{datesInWeek.map((date) => dateSelector(date, true))}</View><AppCard style={styles.weekSummary}><AppText size={13} weight="semibold">This week</AppText><View style={styles.weekStats}><AppText size={12} muted>{datesInWeek.reduce((sum, date) => sum + (range?.days[date]?.plannedTasks ?? 0), 0)} planned tasks</AppText><AppText size={12} muted>{datesInWeek.reduce((sum, date) => sum + (range?.days[date]?.completedTasks ?? 0), 0)} completions</AppText><AppText size={12} muted>{datesInWeek.reduce((sum, date) => sum + (range?.days[date]?.scheduledHabits ?? 0), 0)} habit slots</AppText><AppText size={12} muted>{datesInWeek.reduce((sum, date) => sum + (deadlinesByDate.get(date) ?? 0), 0)} current deadlines</AppText></View></AppCard></>}
        {mode === "day" && <AppCard style={styles.dayHeader}><AppText size={12} weight="semibold" muted>SELECTED DAY</AppText><AppText size={25} weight="bold">{formatDate(selectedDate, { day: "numeric" })}</AppText><AppText size={13} muted>{formatDate(selectedDate, { weekday: "long", month: "long", year: "numeric" })}</AppText><View style={styles.weekStrip}>{datesInWeek.map((date) => dateSelector(date, true))}</View></AppCard>}
      </View>
      <AppCard style={[styles.agendaCard, wide ? styles.agendaCardWide : undefined]}>{agenda}</AppCard>
    </View>
    {loading && detail && <AppText size={10} muted>Refreshing calendar…</AppText>}
  </View>;
}

const styles = StyleSheet.create({
  page: { width: "100%", maxWidth: 1320, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" }, headerCopy: { gap: spacing.xs },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.md }, navigation: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, navArrow: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: radii.md }, rangeTitle: { marginLeft: spacing.sm }, modeSwitch: { flexDirection: "row", alignItems: "center", padding: 4, borderRadius: radii.md, backgroundColor: "rgba(128,128,128,0.08)" }, modeButton: { minHeight: 38, minWidth: 66, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, paddingHorizontal: spacing.md },
  body: { gap: spacing.lg }, bodyWide: { flexDirection: "row", alignItems: "flex-start" }, calendarPane: { gap: spacing.md }, calendarPaneWide: { flex: 1.6, minWidth: 0 }, monthGrid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285%", textAlign: "center", paddingVertical: spacing.sm }, monthCell: { width: "14.285%", borderWidth: 1, padding: 5, gap: 7 }, monthCellBlank: { width: "14.285%", minHeight: 76, borderWidth: 1, borderColor: "transparent" }, dateCellTop: { flexDirection: "row", alignItems: "center", gap: 5 }, todayMark: { width: 5, height: 5, borderRadius: 3 }, markers: { minHeight: 20, justifyContent: "space-between" }, dots: { flexDirection: "row", alignItems: "center", gap: 4 }, dot: { width: 5, height: 5, borderRadius: 3 }, legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.md }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  weekStrip: { flexDirection: "row", gap: spacing.xs }, dateChip: { flex: 1, borderWidth: 1, borderRadius: radii.md, padding: spacing.xs, justifyContent: "space-between" }, weekSummary: { gap: spacing.sm }, weekStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, dayHeader: { gap: spacing.xs },
  agendaCard: { width: "100%" }, agendaCardWide: { width: 390, flexGrow: 1, flexShrink: 0 }, agenda: { gap: spacing.md }, agendaHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }, daySummary: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: "rgba(128,128,128,0.07)" }, summaryStats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm }, agendaSection: { gap: spacing.sm, marginTop: spacing.xs }, agendaRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm }, eventRail: { width: 3, height: 32, borderRadius: 2 }, agendaCopy: { flex: 1, gap: 2 }, smallAction: { minHeight: 40, minWidth: 38, justifyContent: "center", alignItems: "center" }, check: { width: 30, height: 30, borderWidth: 1.5, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" }, recordRow: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: spacing.sm }, emptyInline: { paddingVertical: spacing.xs }, coverage: { paddingTop: spacing.xs },
});
