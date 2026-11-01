import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { DailyProgressDTO } from "@hyper-track/shared";
import { AppButton, AppCard, AppText, EmptyState, ProgressBar, SectionTitle } from "./ui";
import { fontSizes, motion, radii, spacing, useAppTheme } from "../theme/theme";

export type DashboardTask = { _id: string; title: string; status: "todo" | "in_progress" | "done"; priority: "low" | "medium" | "high"; dueDate?: string | null; plannedDate?: string | null };
export type DashboardHabit = { _id: string; name: string; icon?: string; completions: string[]; frequency: "daily" | "weekly"; daysOfWeek?: number[] };
export type DashboardGame = { totalXp: number; level: number; levelName: string; currentLevelXp: number; nextLevelXp: number; progress: number; currentStreak: number; longestStreak: number };

function localDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function displayDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function XPProgress({ game }: { game: DashboardGame | null }) {
  const { colors } = useAppTheme();
  const barWidth = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef(0);
  const previousLevel = useRef<number | null>(null);
  const [levelUp, setLevelUp] = useState(false);
  useEffect(() => {
    if (!game) return;
    if (previousLevel.current !== null && game.level > previousLevel.current) {
      setLevelUp(true);
      const timer = setTimeout(() => setLevelUp(false), 2800);
      previousLevel.current = game.level;
      return () => clearTimeout(timer);
    }
    previousLevel.current = game.level;
  }, [game?.level]);
  useEffect(() => {
    if (!game || !trackWidth.current) return;
    Animated.timing(barWidth, { toValue: trackWidth.current * Math.min(100, Math.max(0, game.progress)) / 100, duration: motion.slow, useNativeDriver: false }).start();
  }, [barWidth, game?.progress, game?.level]);

  return <AppCard style={styles.xpCard}>
    <View style={styles.xpHeader}>
      <View style={styles.xpTitleGroup}>
        <AppText size={11} weight="bold" muted>YOUR PROGRESS</AppText>
        {game ? <View style={styles.levelRow}><AppText size={24} weight="bold">Level {game.level}</AppText><AppText size={14} weight="medium" muted>{game.levelName}</AppText></View> : <AppText size={18} weight="semibold">Progress is unavailable</AppText>}
      </View>
      {game && <View style={styles.xpTotal}><AppText size={22} weight="bold">{game.totalXp.toLocaleString()}</AppText><AppText size={11} muted>total EXP</AppText></View>}
    </View>
    {game && <>
      <View style={[styles.xpTrack, { backgroundColor: colors.surfaceMuted }]} onLayout={(event) => {
        trackWidth.current = event.nativeEvent.layout.width;
        barWidth.setValue(0);
        Animated.timing(barWidth, { toValue: trackWidth.current * Math.min(100, Math.max(0, game.progress)) / 100, duration: motion.slow, useNativeDriver: false }).start();
      }} accessibilityRole="progressbar" accessibilityLabel={`Level ${game.level} progress`} accessibilityValue={{ min: 0, max: 100, now: game.progress }}>
        <Animated.View style={[styles.xpFill, { backgroundColor: colors.primary, width: barWidth }]} />
      </View>
      <View style={styles.xpFooter}><AppText size={12} muted>{Math.max(0, game.nextLevelXp - game.totalXp).toLocaleString()} EXP to level {game.level + 1}</AppText><AppText size={12} weight="semibold" style={{ color: colors.primary }}>{game.progress}%</AppText></View>
      <View style={styles.xpMeta}><AppText size={11} muted>{game.currentStreak} day streak · best {game.longestStreak}</AppText>{levelUp && <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }} accessibilityLiveRegion="polite">Level up! You reached level {game.level}.</Text>}</View>
    </>}
  </AppCard>;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "success" }) {
  const { colors } = useAppTheme();
  const valueColor = tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.text;
  const wide = useWindowDimensions().width >= 760;
  return <View style={[styles.metric, wide ? styles.metricWide : undefined, { backgroundColor: colors.surface }]}><AppText size={22} weight="bold" style={{ color: valueColor }}>{value}</AppText><AppText size={11} muted>{label}</AppText></View>;
}

function CompletionCheck({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const wasChecked = useRef(false);
  useEffect(() => {
    if (checked && !wasChecked.current) Animated.sequence([
      Animated.timing(scale, { toValue: 1.22, duration: motion.fast, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 5, useNativeDriver: true }),
    ]).start();
    wasChecked.current = checked;
  }, [checked, scale]);
  return <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} style={styles.checkHit}>
    <Animated.View style={[styles.check, { transform: [{ scale }], borderColor: checked ? colors.success : colors.border, backgroundColor: checked ? colors.successSoft : "transparent" }]}><Text style={{ color: colors.success, fontSize: 13, fontWeight: "800" }}>{checked ? "✓" : ""}</Text></Animated.View>
  </Pressable>;
}

function TaskRow({ task, onToggle, dueLabel }: { task: DashboardTask; onToggle: (id: string) => void; dueLabel?: string }) {
  const { colors } = useAppTheme();
  const done = task.status === "done";
  return <View style={[styles.row, { borderBottomColor: colors.border }]}>
    <CompletionCheck checked={done} label={`${done ? "Reopen" : "Complete"} ${task.title}`} onPress={() => onToggle(task._id)} />
    <View style={styles.rowCopy}><AppText size={14} weight="medium" style={done ? { color: colors.textMuted, textDecorationLine: "line-through" } : undefined}>{task.title}</AppText>{dueLabel && <AppText size={11} muted>{dueLabel}</AppText>}</View>
    <View style={[styles.priorityMark, { backgroundColor: task.priority === "high" ? colors.danger : task.priority === "medium" ? colors.warning : colors.success }]} />
  </View>;
}

export function Dashboard({ name, today, timezone, tasks, taskCoveragePartial, habits, weekly, game, isOffline, onTaskToggle, onHabitToggle, onNavigate, onAddTask, focus, focusRemaining, focusMinutes, onFocusMinutes, onStartFocus, onFinishFocus }: {
  name: string; today: string; timezone: string; tasks: DashboardTask[]; taskCoveragePartial: boolean; habits: DashboardHabit[]; weekly: { days: DailyProgressDTO[]; totals: { tasksCompleted: number; habitCompletions: number } } | null;
  game: DashboardGame | null; isOffline: boolean; onTaskToggle: (id: string) => void; onHabitToggle: (id: string) => void; onNavigate: (destination: "tasks" | "habits" | "calendar") => void; onAddTask: () => void;
  focus: { plannedMinutes: number } | null; focusRemaining: number | null; focusMinutes: number; onFocusMinutes: (minutes: number) => void; onStartFocus: () => void; onFinishFocus: (status: "completed" | "cancelled") => void;
}) {
  const { colors } = useAppTheme();
  const wide = useWindowDimensions().width >= 760;
  const todayTasks = useMemo(() => tasks.filter((task) => task.plannedDate === today || (!!task.dueDate && localDate(task.dueDate, timezone) === today)), [tasks, today, timezone]);
  const scheduledHabits = useMemo(() => {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    return habits.filter((habit) => habit.frequency === "daily" || !!habit.daysOfWeek?.includes(weekday));
  }, [habits, today]);
  const completedTasks = todayTasks.filter((task) => task.status === "done").length;
  const tasksRemaining = todayTasks.filter((task) => task.status !== "done").length;
  const overdueTasks = tasks.filter((task) => task.status !== "done" && task.dueDate && localDate(task.dueDate, timezone) < today).length;
  const completedHabits = scheduledHabits.filter((habit) => habit.completions.includes(today)).length;
  const taskPercent = todayTasks.length ? Math.round(completedTasks / todayTasks.length * 100) : 0;
  const dailyCount = todayTasks.length + scheduledHabits.length;
  const dailyDone = completedTasks + completedHabits;
  const dailyPercent = dailyCount ? Math.round(dailyDone / dailyCount * 100) : 0;
  const priorityTasks = useMemo(() => tasks.filter((task) => task.status !== "done").sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  }).slice(0, 5), [tasks]);
  const upcoming = useMemo(() => tasks.filter((task) => task.status !== "done" && task.dueDate).map((task) => ({ task, date: localDate(task.dueDate!, timezone) })).filter(({ date }) => date >= today && date <= new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5), [tasks, today, timezone]);
  const bestDay = weekly?.days.reduce<DailyProgressDTO | null>((best, day) => !best || day.tasksCompleted + day.habitsCompleted > best.tasksCompleted + best.habitsCompleted ? day : best, null) ?? null;
  const greetingHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  return <View style={styles.content}>
    <View style={styles.pageHeader}><View><AppText size={fontSizes.display} weight="bold">{greeting}, {name.split(" ")[0]}</AppText><AppText muted>{displayDate(today)}</AppText></View><AppButton variant="secondary" onPress={onAddTask}>+ Add task</AppButton></View>
    {isOffline && <View style={[styles.offline, { backgroundColor: colors.warningSoft }]}><AppText size={12} style={{ color: colors.warning }}>{taskCoveragePartial ? "Offline · task metrics use cached data and may omit older tasks. Reconnect to refresh." : "Offline · new tasks and habits will sync when you reconnect."}</AppText></View>}
    <XPProgress game={game} />

    <View style={styles.metricsGrid}>
      <Metric label="Tasks done today" value={`${completedTasks} / ${todayTasks.length}`} tone="success" />
      <Metric label="Tasks left today" value={tasksRemaining} />
      <Metric label="Overdue tasks" value={overdueTasks} tone={overdueTasks ? "danger" : undefined} />
      <Metric label="Habits today" value={`${completedHabits} / ${scheduledHabits.length}`} />
    </View>

    <View style={styles.progressGroup}>
      <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SectionTitle title="Today's progress" />
        <View style={styles.progressLabel}><AppText size={12} muted>Scheduled items completed</AppText><AppText size={12} weight="bold">{dailyPercent}%</AppText></View>
        <ProgressBar value={dailyPercent} />
        <AppText size={11} muted style={styles.progressHint}>{dailyCount ? `${dailyDone} of ${dailyCount} tasks and scheduled habits` : "No tasks or habits scheduled for today"}</AppText>
      </View>
      <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SectionTitle title="Task completion" />
        <View style={styles.progressLabel}><AppText size={12} muted>Today's tasks</AppText><AppText size={12} weight="bold">{completedTasks} / {todayTasks.length}</AppText></View>
        <ProgressBar value={taskPercent} color={colors.success} />
        <AppText size={11} muted style={styles.progressHint}>{tasksRemaining ? `${tasksRemaining} still to do` : todayTasks.length ? "All scheduled tasks complete" : "No tasks scheduled"}</AppText>
      </View>
      <AppCard style={styles.progressCard}><SectionTitle title="Focus" />
        {focus ? <><AppText size={14} weight="semibold">{focusRemaining ?? focus.plannedMinutes} min remaining</AppText><AppText size={12} muted style={styles.focusNote}>Your session keeps running while you work.</AppText><View style={styles.focusActions}><AppButton onPress={() => onFinishFocus("completed")}>Finish</AppButton><AppButton variant="quiet" onPress={() => onFinishFocus("cancelled")}>End</AppButton></View></> : <><AppText size={12} muted style={styles.focusNote}>Set aside a quiet block for your next task.</AppText><View style={styles.focusActions}>{[15, 25, 50].map((minutes) => <Pressable key={minutes} accessibilityRole="radio" accessibilityState={{ selected: focusMinutes === minutes }} onPress={() => onFocusMinutes(minutes)} style={[styles.minuteOption, { backgroundColor: focusMinutes === minutes ? colors.primarySoft : colors.surfaceMuted }]}><AppText size={12} weight="semibold" style={{ color: focusMinutes === minutes ? colors.primary : colors.textMuted }}>{minutes}m</AppText></Pressable>)}<AppButton onPress={onStartFocus}>Start</AppButton></View></>}
      </AppCard>
    </View>

    <View style={styles.columns}>
      <AppCard style={[styles.panel, wide ? styles.half : undefined]}><SectionTitle title="Priority tasks" action="All tasks" onAction={() => onNavigate("tasks")} />
        {priorityTasks.length ? priorityTasks.map((task) => <TaskRow key={task._id} task={task} onToggle={onTaskToggle} dueLabel={task.dueDate ? `Due ${localDate(task.dueDate, timezone)}` : task.priority.toUpperCase()} />) : <EmptyState title="You're clear for now" detail="No open tasks. Add one when something needs your attention." />}
      </AppCard>
      <AppCard style={[styles.panel, wide ? styles.half : undefined]}><SectionTitle title="Upcoming deadlines" action="Calendar" onAction={() => onNavigate("calendar")} />
        {upcoming.length ? upcoming.map(({ task, date }) => <View key={task._id} style={[styles.row, { borderBottomColor: colors.border }]}><View style={[styles.dateBadge, { backgroundColor: colors.primarySoft }]}><AppText size={10} weight="bold" style={{ color: colors.primary }}>{date.slice(5)}</AppText></View><View style={styles.rowCopy}><AppText size={14} weight="medium">{task.title}</AppText><AppText size={11} muted>{task.priority} priority · {date === today ? "Due today" : displayDate(date)}</AppText></View></View>) : <EmptyState title="No deadlines this week" detail="Tasks due in the next seven days will appear here." />}
      </AppCard>
      <AppCard style={[styles.panel, wide ? styles.half : undefined]}><SectionTitle title="Today's habits" action="View habits" onAction={() => onNavigate("habits")} />
        {scheduledHabits.length ? scheduledHabits.slice(0, 6).map((habit) => {
          const done = habit.completions.includes(today);
          return <View key={habit._id} style={[styles.row, { borderBottomColor: colors.border, minHeight: 48 }]}>
            <CompletionCheck checked={done} label={`${done ? "Undo" : "Complete"} ${habit.name}`} onPress={() => onHabitToggle(habit._id)} /><View style={styles.rowCopy}><AppText size={14} weight="medium">{habit.icon ?? "•"}  {habit.name}</AppText><AppText size={11} muted>{done ? "Completed today" : habit.frequency === "daily" ? "Daily" : "Scheduled today"}</AppText></View>
          </View>;
        }) : <EmptyState title="No habits scheduled today" detail="Your next scheduled check-ins will show here." />}
      </AppCard>
      <AppCard style={[styles.panel, wide ? styles.half : undefined]}><SectionTitle title="This week" />
        {weekly ? <>
          <View style={styles.weekTotal}><AppText size={24} weight="bold">{weekly.totals.tasksCompleted + weekly.totals.habitCompletions}</AppText><AppText size={12} muted>completions in the last 7 days</AppText></View>
          <View style={[styles.chart, { borderColor: colors.border }]} accessibilityLabel="Daily task and habit completions for the last seven days">
            {weekly.days.map((day) => {
              const count = day.tasksCompleted + day.habitsCompleted;
              const max = Math.max(1, ...weekly.days.map((item) => item.tasksCompleted + item.habitsCompleted));
              const height = Math.max(count ? 8 : 3, count / max * 64);
              const label = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 1);
              return <View key={day.date} accessibilityRole="progressbar" accessibilityLabel={`${new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })}: ${day.tasksCompleted} tasks, ${day.habitsCompleted} habits completed`} accessibilityValue={{ min: 0, max, now: count }} style={styles.barColumn}><AppText size={10} muted>{count || ""}</AppText><View style={[styles.weekBar, { height, backgroundColor: count ? colors.primary : colors.surfaceMuted }]} /><AppText size={10} muted>{label}</AppText></View>;
            })}
          </View>
          {bestDay && (bestDay.tasksCompleted + bestDay.habitsCompleted) > 0 ? <AppText size={12} muted style={styles.insight}>Most activity: {new Date(`${bestDay.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })} ({bestDay.tasksCompleted + bestDay.habitsCompleted} completions).</AppText> : <AppText size={12} muted style={styles.insight}>Activity will appear here as you complete tasks and habits.</AppText>}
        </> : <EmptyState title="Weekly summary unavailable" detail="Reconnect to load your recorded activity." />}
      </AppCard>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, gap: spacing.xl },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" },
  offline: { padding: spacing.md, borderRadius: radii.md },
  xpCard: { padding: spacing.xl, borderRadius: radii.lg, gap: spacing.md },
  xpHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }, xpTitleGroup: { gap: spacing.xs }, levelRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm }, xpTotal: { alignItems: "flex-end" },
  xpTrack: { height: 10, borderRadius: radii.pill, backgroundColor: "#00000012", overflow: "hidden" }, xpFill: { height: "100%", borderRadius: radii.pill },
  xpFooter: { flexDirection: "row", justifyContent: "space-between" }, xpMeta: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, metric: { width: "48.5%", minHeight: 76, padding: spacing.md, borderWidth: 1, borderColor: "transparent", borderRadius: radii.md, gap: spacing.xs, justifyContent: "center" }, metricWide: { width: "23.5%" },
  progressGroup: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, progressCard: { flex: 1, minWidth: 260, padding: spacing.lg, borderWidth: 1, borderRadius: radii.lg }, progressLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }, progressHint: { marginTop: spacing.sm },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, panel: { width: "100%", padding: spacing.lg, borderRadius: radii.lg }, half: { width: "48.8%" },
  row: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm }, checkHit: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }, check: { width: 22, height: 22, borderRadius: radii.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, gap: 2 }, priorityMark: { width: 7, height: 7, borderRadius: radii.pill }, dateBadge: { minWidth: 44, minHeight: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  weekTotal: { gap: spacing.xs }, chart: { height: 104, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", paddingTop: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#8490A544" }, barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: spacing.xs }, weekBar: { width: 14, borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm }, insight: { marginTop: spacing.md },
  focusNote: { marginTop: spacing.xs }, focusActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.md }, minuteOption: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.md },
});
