import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, clearOfflineApiData, isApiOffline } from "../src/lib/api";
import { clearToken, getToken, saveRefreshToken, saveToken } from "../src/lib/auth";
import { clearAllTaskReminders, clearTaskReminder, configureNotifications, ensureTaskReminder, setTaskReminder } from "../src/lib/notifications";
import type { AuthUserDTO, DailyProgressDTO, GoalDTO, HabitDTO, ProjectDTO, TaskDTO } from "@hyper-track/shared";
import { useAppTheme, type ThemeMode } from "../src/theme/theme";
import { ProgressBar } from "../src/components/ui";
import type { AppDestination } from "../src/components/AppNavigation";
import { AppShell } from "../src/components/AppShell";
import { Dashboard } from "../src/components/Dashboard";

type User = AuthUserDTO;
type Task = Omit<TaskDTO, "project" | "parentTask"> & {
  project?: { _id: string; name: string } | null;
  parentTask?: { _id: string; title: string } | null;
};
type Habit = HabitDTO;
type Goal = GoalDTO;
type Project = ProjectDTO;
type AuthResponse = { user: User; token: string; refreshToken: string };
type WeeklySummary = { timezone: string; days: DailyProgressDTO[]; totals: { tasksCompleted: number; habitCompletions: number } };
type CalendarDay = { plannedTasks: number; completedTasks: number; completedHabits: number; scheduledHabits: number };
type CalendarDetail = { date: string; isFuture: boolean; plannedTasks: Array<{ title: string; status: string; priority: string }>; completedTasks: Array<{ title: string; reversedAt?: string | null }>; scheduledHabits: Array<{ _id: string; name: string }>; completedHabits: Array<{ habit: string; name: string; reversedAt?: string | null }>; reversedHabitCompletions: Array<{ name: string }>; habitCompletionPercent: number | null; productivityScore: number | null; xpEarned: number | null };
type FocusDTO = { _id: string; startedAt: string; plannedMinutes: number; status: "active" | "completed" | "cancelled" };
type GameSummary = { totalXp: number; level: number; levelName: string; currentLevelXp: number; nextLevelXp: number; progress: number; currentStreak: number; longestStreak: number; achievements: Array<{ id: string; name: string; description: string; unlocked: boolean }>; challenges: Array<{ title: string; description: string; progress: number; target: number; completed: boolean }>; recentTransactions?: Array<{ localDate: string; amount: number }> };
type TaskPage = { tasks: Task[]; total: number; limit: number; page: number };

const today = (timezone?: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const dateParts = (date: Date, timezone?: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));

const dateAtTimezone = (date: string, time: string, timezone?: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(new Date(guess), timezone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += desired - represented;
  }
  const result = new Date(guess);
  const verified = dateParts(result, timezone);
  if (Number(verified.year) !== year || Number(verified.month) !== month || Number(verified.day) !== day || Number(verified.hour) !== hour || Number(verified.minute) !== minute) {
    throw new Error("That date and time is not valid in your timezone.");
  }
  return result;
};

const localDateOf = (value: string, timezone?: string) => {
  const parts = dateParts(new Date(value), timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toLocalDateTimeInput = (value?: string | null, timezone?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = dateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

export default function HomeScreen() {
  const { colors, mode, setMode } = useAppTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskCoveragePartial, setTaskCoveragePartial] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [goalTargetDate, setGoalTargetDate] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newMilestone, setNewMilestone] = useState("");
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [taskParentId, setTaskParentId] = useState<string | null>(null);
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPlannedDate, setTaskPlannedDate] = useState("");
  const [taskReminderAt, setTaskReminderAt] = useState("");
  const [taskRecurrence, setTaskRecurrence] = useState<"none" | "daily" | "weekly">("none");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [habitFrequency, setHabitFrequency] = useState<"daily" | "weekly">("daily");
  const [habitTarget, setHabitTarget] = useState(3);
  const [habitDays, setHabitDays] = useState<number[]>([]);
  const [habitCategory, setHabitCategory] = useState("Personal");
  const [habitDifficulty, setHabitDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [tab, setTab] = useState<AppDestination>("overview");
  const [profileSection, setProfileSection] = useState<"progress" | "projects" | "goals" | "settings">("settings");
  const [selectedDate, setSelectedDate] = useState(today());
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">("month");
  const [calendarDays, setCalendarDays] = useState<Record<string, CalendarDay>>({});
  const [calendarDetail, setCalendarDetail] = useState<CalendarDetail | null>(null);
  const [focusSession, setFocusSession] = useState<FocusDTO | null>(null);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"day" | "week" | "month">("week");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [, setClockTick] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [profileTimezone, setProfileTimezone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOffline, setIsOffline] = useState(false);

  async function loadData() {
    const [firstTaskPage, habitData, progressData, goalData, projectData] = await Promise.all([
      api<TaskPage>("/tasks?limit=100"), api<{ habits: Habit[] }>("/habits"), api<WeeklySummary>("/progress/weekly"), api<{ goals: Goal[] }>("/goals"), api<{ projects: Project[] }>("/projects")
    ]);
    let laterPages: TaskPage[] = [];
    setTaskCoveragePartial(false);
    try {
      laterPages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(firstTaskPage.total / firstTaskPage.limit) - 1) }, (_, index) => api<TaskPage>(`/tasks?limit=${firstTaskPage.limit}&page=${index + 2}`)));
    } catch (error) {
      if (!isApiOffline()) throw error;
      setTaskCoveragePartial(firstTaskPage.total > firstTaskPage.limit);
    }
    const allTasks = [ ...firstTaskPage.tasks, ...laterPages.flatMap((page) => page.tasks) ];
    setTasks(allTasks); setHabits(habitData.habits); setWeekly(progressData); setGoals(goalData.goals); setProjects(projectData.projects);
    try { const focus = await api<{ active: FocusDTO | null }>("/focus"); setFocusSession(focus.active); } catch { /* Focus is optional when offline. */ }
    try { setGameSummary(await api<GameSummary>("/gamification")); } catch { /* Keep the core dashboard usable if rewards are temporarily unavailable. */ }
    await Promise.all(allTasks.filter((task) => !task._id.startsWith("local-") && task.reminderAt).map((task) => ensureTaskReminder(task._id, task.title, task.reminderAt).catch(() => undefined)));
    setIsOffline(isApiOffline());
  }

  async function loadCalendar(date: string) {
    setSelectedDate(date);
    const [year, month] = date.split("-").map(Number);
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const toDate = new Date(Date.UTC(year, month, 0));
    const to = toDate.toISOString().slice(0, 10);
    const [monthData, detail] = await Promise.all([
      api<{ days: Record<string, CalendarDay> }>(`/calendar?from=${from}&to=${to}`),
      api<CalendarDetail>(`/calendar/day/${date}`)
    ]);
    setCalendarDays(monthData.days); setCalendarDetail(detail);
  }

  function shiftCalendar(direction: -1 | 1) {
    const date = new Date(`${selectedDate}T12:00:00Z`);
    if (calendarMode === "month") { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction); }
    else date.setUTCDate(date.getUTCDate() + direction * (calendarMode === "week" ? 7 : 1));
    void loadCalendar(date.toISOString().slice(0, 10));
  }

  function resetTaskForm() {
    setNewTask(""); setEditingTask(null); setTaskDueDate(""); setTaskPlannedDate(""); setTaskReminderAt(""); setTaskProjectId(null); setTaskParentId(null); setTaskPriority("medium"); setTaskRecurrence("none");
  }

  function resetHabitForm() {
    setNewHabit(""); setEditingHabit(null); setHabitFrequency("daily"); setHabitTarget(3); setHabitDays([]); setHabitCategory("Personal"); setHabitDifficulty("medium");
  }

  useEffect(() => {
    void configureNotifications().catch(() => undefined);
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const result = await api<{ user: User }>("/auth/me");
          setUser(result.user);
          setProfileName(result.user.name); setProfileTimezone(result.user.timezone ?? "UTC");
          await loadData();
        }
      } catch { await clearToken(); await clearOfflineApiData(); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (user && tab === "calendar") void loadCalendar(selectedDate).catch((e) => showError(e)); }, [user, tab]);
  useEffect(() => {
    if (!user || tab !== "profile" || profileSection !== "progress") return;
    const end = today(user.timezone); const date = new Date(`${end}T12:00:00Z`);
    if (analyticsRange === "week") date.setUTCDate(date.getUTCDate() - 6);
    if (analyticsRange === "month") date.setUTCDate(1);
    const from = date.toISOString().slice(0, 10);
    void api<WeeklySummary>(`/progress/summary?from=${from}&to=${end}`).then(setWeekly).catch((e) => showError(e));
  }, [user, tab, profileSection, analyticsRange]);
  useEffect(() => { if (!focusSession) return; const timer = setInterval(() => setClockTick(Date.now()), 1000); return () => clearInterval(timer); }, [focusSession]);

  async function startFocus() {
    try { const result = await api<{ session: FocusDTO }>("/focus", { method: "POST", body: JSON.stringify({ plannedMinutes: focusMinutes }) }); setFocusSession(result.session); }
    catch (e) { showError(e); }
  }
  async function finishFocus(status: "completed" | "cancelled") {
    if (!focusSession) return;
    try { await api(`/focus/${focusSession._id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setFocusSession(null); }
    catch (e) { showError(e); }
  }

  async function submitAuth() {
    setBusy(true); setError(""); setNotice("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const result = await api<AuthResponse>(`/auth/${authMode}`, {
        method: "POST", body: JSON.stringify(authMode === "register" ? { name, email, password, timezone } : { email, password })
      });
      await Promise.all([saveToken(result.token), saveRefreshToken(result.refreshToken)]); setUser(result.user); setProfileName(result.user.name); setProfileTimezone(result.user.timezone ?? "UTC"); setPassword(""); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    try {
      if (taskDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskDueDate)) throw new Error("Enter the due date as YYYY-MM-DD.");
      const dueDate = taskDueDate ? dateAtTimezone(taskDueDate, "12:00", user?.timezone).toISOString() : null;
      if (taskPlannedDate && !/^\d{4}-\d{2}-\d{2}$/.test(taskPlannedDate)) throw new Error("Enter the plan date as YYYY-MM-DD.");
      if (taskPlannedDate) dateAtTimezone(taskPlannedDate, "12:00", user?.timezone);
      const plannedDate = taskPlannedDate || (tab === "calendar" && !editingTask ? selectedDate : tab === "overview" && !editingTask ? today(user?.timezone) : null);
      if (taskReminderAt && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(taskReminderAt)) throw new Error("Enter a reminder as YYYY-MM-DD HH:mm.");
      const reminderDate = taskReminderAt ? dateAtTimezone(...taskReminderAt.split(" ") as [string, string], user?.timezone) : null;
      if (reminderDate && reminderDate.getTime() <= Date.now()) throw new Error("Choose a reminder time in the future.");
      const reminderAt = reminderDate?.toISOString() ?? null;
      const input = { title: newTask.trim(), priority: taskPriority, dueDate, plannedDate, reminderAt, recurrence: taskRecurrence, projectId: taskProjectId, parentTaskId: taskParentId };
      const result = editingTask
        ? await api<{ task: Task }>(`/tasks/${editingTask}`, { method: "PATCH", body: JSON.stringify(input) })
        : await api<{ task: Task }>("/tasks", { method: "POST", body: JSON.stringify(input) });
      if (result.task._id.startsWith("local-")) {
        if (reminderAt) showError("Task saved for sync. Its reminder will be scheduled once the task reaches the server.");
      } else {
        try { await setTaskReminder(result.task._id, result.task.title, reminderAt); } catch (e) { showError(e); }
      }
      resetTaskForm(); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function deleteTask(task: Task) {
    try { await api(`/tasks/${task._id}`, { method: "DELETE" }); await Promise.all([task, ...tasks.filter((item) => item.parentTask?._id === task._id)].map((item) => clearTaskReminder(item._id))); if (editingTask === task._id) { setEditingTask(null); setNewTask(""); } await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleTask(task: Task) {
    try {
      await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }) });
      if (task.status === "done") {
        if (task.reminderAt && new Date(task.reminderAt).getTime() > Date.now()) await setTaskReminder(task._id, task.title, task.reminderAt);
      } else await clearTaskReminder(task._id);
      await loadData();
    }
    catch (e) { showError(e); }
  }

  async function addHabit() {
    if (!newHabit.trim()) return;
    try {
      const input = { name: newHabit.trim(), category: habitCategory.trim() || "Personal", difficulty: habitDifficulty, frequency: habitFrequency, targetPerWeek: habitFrequency === "daily" ? 7 : habitTarget, daysOfWeek: habitFrequency === "daily" ? [] : habitDays };
      if (editingHabit) await api(`/habits/${editingHabit}`, { method: "PATCH", body: JSON.stringify(input) });
      else await api("/habits", { method: "POST", body: JSON.stringify(input) });
      resetHabitForm(); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function deleteHabit(habit: Habit) {
    try { await api(`/habits/${habit._id}`, { method: "DELETE" }); if (editingHabit === habit._id) { setEditingHabit(null); setNewHabit(""); } await loadData(); }
    catch (e) { showError(e); }
  }

  async function saveProfile() {
    try {
      const result = await api<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: profileName.trim(), timezone: profileTimezone.trim() }) });
      setUser(result.user); setError(""); setNotice("Profile saved."); await loadData();
    } catch (e) { showError(e); }
  }

  async function createGoal() {
    if (!newGoal.trim()) return;
    try {
      if (goalTargetDate && !/^\d{4}-\d{2}-\d{2}$/.test(goalTargetDate)) throw new Error("Enter the goal date as YYYY-MM-DD.");
      const targetDate = goalTargetDate ? dateAtTimezone(goalTargetDate, "12:00", user?.timezone).toISOString() : null;
      const payload = JSON.stringify({ title: newGoal.trim(), targetDate });
      if (editingGoalId) await api(`/goals/${editingGoalId}`, { method: "PATCH", body: payload });
      else await api("/goals", { method: "POST", body: payload });
      setNewGoal(""); setGoalTargetDate(""); setEditingGoalId(null); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function createProject() {
    if (!newProject.trim()) return;
    try {
      const body = JSON.stringify({ name: newProject.trim() });
      if (editingProjectId) await api(`/projects/${editingProjectId}`, { method: "PATCH", body });
      else await api("/projects", { method: "POST", body });
      setNewProject(""); setEditingProjectId(null); await loadData();
    }
    catch (e) { showError(e); }
  }

  async function addMilestone(goalId: string) {
    if (!newMilestone.trim()) return;
    try { await api(`/goals/${goalId}/milestones`, { method: "POST", body: JSON.stringify({ title: newMilestone.trim() }) }); setNewMilestone(""); setMilestoneGoalId(null); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleMilestone(goal: Goal, milestone: Goal["milestones"][number]) {
    try { await api(`/goals/${goal._id}/milestones/${milestone._id}`, { method: "PATCH", body: JSON.stringify({ completed: !milestone.completedAt }) }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleHabit(habit: Habit) {
    const done = habit.completions.includes(today(user?.timezone));
    try {
      if (done) await api(`/habits/${habit._id}/completions/${today(user?.timezone)}`, { method: "DELETE" });
      else await api(`/habits/${habit._id}/completions`, { method: "POST", body: JSON.stringify({ date: today(user?.timezone) }) });
      await loadData();
    } catch (e) { showError(e); }
  }

  async function showHabitAnalytics(habit: Habit) {
    const end = today(user?.timezone);
    const startDate = new Date(`${end}T12:00:00Z`); startDate.setUTCDate(1);
    try {
      const stats = await api<{ totalCompletions: number; completionPercent: number | null; currentStreak: number | null; bestWeekday: string | null; missedScheduledDays: string[] }>(`/habits/${habit._id}/analytics?from=${startDate.toISOString().slice(0, 10)}&to=${end}`);
      Alert.alert(`${habit.name} · this month`, `${stats.totalCompletions} check-ins · ${stats.completionPercent ?? 0}% scheduled days${stats.currentStreak === null ? "" : ` · ${stats.currentStreak} day streak`}${stats.bestWeekday ? ` · best day: ${stats.bestWeekday}` : ""}${stats.missedScheduledDays.length ? ` · ${stats.missedScheduledDays.length} missed scheduled days` : ""}`);
    } catch (e) { showError(e); }
  }

  function showError(e: unknown) {
    setNotice("");
    const message = e instanceof Error ? e.message : "Something went wrong";
    if (Platform.OS === "web") setError(message); else Alert.alert("Hyper Track", message);
  }

  async function logout() { try { await api("/auth/logout", { method: "POST" }); } catch { /* Local sign out should work offline. */ } await clearAllTaskReminders(); await clearOfflineApiData(); await clearToken(); setIsOffline(false); setUser(null); setTasks([]); setHabits([]); setWeekly(null); setGoals([]); setProjects([]); }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#A5B4FC" /><Text style={styles.muted}>Loading Hyper Track…</Text></View>;

  if (!user) return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
      <View style={styles.logo}><Text style={styles.logoText}>H</Text></View>
      <Text style={styles.brand}>HYPER TRACK</Text>
      <Text style={styles.heading}>{authMode === "login" ? "Welcome back." : "Build your momentum."}</Text>
      <Text style={styles.muted}>Make every day count.</Text>
      {authMode === "register" && <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="words" />}
      <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" placeholderTextColor="#727B95" style={styles.input} secureTextEntry autoComplete={authMode === "login" ? "current-password" : "new-password"} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.success}>{notice}</Text>}
      <Pressable onPress={submitAuth} disabled={busy || !email.trim() || password.length < 8 || (authMode === "register" && name.trim().length < 2)} style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#0B1020" /> : <Text style={styles.primaryText}>{authMode === "login" ? "Sign in" : "Create account"}</Text>}
      </Pressable>
      <Pressable onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }} style={styles.switchAuth}>
        <Text style={styles.muted}>{authMode === "login" ? "New here? " : "Already have an account? "}<Text style={[styles.link, { color: colors.primary }]}>{authMode === "login" ? "Create account" : "Sign in"}</Text></Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;

  const filteredTasks = tasks.filter((task) => (!taskSearch.trim() || task.title.toLowerCase().includes(taskSearch.trim().toLowerCase())) && (taskPriorityFilter === "all" || task.priority === taskPriorityFilter));
  const localToday = today(user?.timezone);
  const completedHabits = habits.filter((habit) => habit.completions.includes(localToday)).length;
  const greetingHour = Number(dateParts(new Date(), user?.timezone).hour);
  const timeGreeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  const selectDestination = (destination: AppDestination) => { setTab(destination); if (destination === "profile") setProfileSection("settings"); resetTaskForm(); resetHabitForm(); setNewGoal(""); setGoalTargetDate(""); setEditingGoalId(null); };
  return <AppShell active={tab} onSelect={selectDestination} name={user.name} email={user.email}>
    <ScrollView contentContainerStyle={tab === "overview" ? { flexGrow: 1 } : styles.page} keyboardShouldPersistTaps="handled">
      {tab === "overview" ? <Dashboard
        name={user.name}
        today={localToday}
        timezone={user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
        tasks={tasks}
        taskCoveragePartial={taskCoveragePartial}
        habits={habits}
        weekly={weekly}
        game={gameSummary}
        isOffline={isOffline}
        onTaskToggle={(id) => { const task = tasks.find((item) => item._id === id); if (task) void toggleTask(task); }}
        onHabitToggle={(id) => { const habit = habits.find((item) => item._id === id); if (habit) void toggleHabit(habit); }}
        onNavigate={selectDestination}
        onAddTask={() => { selectDestination("tasks"); setTaskPlannedDate(localToday); }}
        focus={focusSession}
        focusRemaining={focusSession ? Math.max(0, Math.ceil((focusSession.plannedMinutes * 60 - (Date.now() - new Date(focusSession.startedAt).getTime()) / 1000) / 60)) : null}
        focusMinutes={focusMinutes}
        onFocusMinutes={setFocusMinutes}
        onStartFocus={() => void startFocus()}
        onFinishFocus={(status) => void finishFocus(status)}
      /> : <>
      <View style={styles.topRow}>
        <View><Text style={styles.brandSmall}>HYPER TRACK</Text><Text style={[styles.greeting, { color: colors.text }]}>{timeGreeting}, {user.name.split(" ")[0]} 👋</Text><Text style={styles.statLabel}>{new Date(`${localToday}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</Text></View>
        <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable>
      </View>
      {isOffline && <Text style={styles.offlineNotice}>Offline · new tasks and habits will sync when you reconnect. Other changes need a connection.</Text>}
      {tab === "calendar" && <View style={styles.section}>
        <View style={styles.sectionHeading}><Pressable onPress={() => shiftCalendar(-1)}><Text style={[styles.sectionTitle, { color: colors.text }]}>‹</Text></Pressable><Text style={[styles.sectionTitle, { color: colors.text }]}>{new Date(`${selectedDate.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</Text><Pressable onPress={() => shiftCalendar(1)}><Text style={[styles.sectionTitle, { color: colors.text }]}>›</Text></Pressable></View>
        <View style={styles.optionRow}>{(["month", "week", "day"] as const).map((value) => <Pressable key={value} onPress={() => setCalendarMode(value)} style={[styles.optionPill, calendarMode === value && styles.optionPillActive]}><Text style={[styles.optionPillText, calendarMode === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}<Pressable onPress={() => void loadCalendar(today(user?.timezone))} style={styles.optionPill}><Text style={styles.optionPillText}>Today</Text></Pressable></View>
        {calendarMode === "month" && <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={`${d}${i}`} style={[styles.dayLabel, { width: "14.28%", textAlign: "center", paddingVertical: 8 }]}>{d}</Text>)}{Array.from({ length: new Date(`${selectedDate.slice(0, 7)}-01T00:00:00Z`).getUTCDay() }, (_, i) => <View key={`blank${i}`} style={{ width: "14.28%", height: 46 }} />)}{Array.from({ length: new Date(Date.UTC(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)), 0)).getUTCDate() }, (_, i) => { const day = i + 1; const date = `${selectedDate.slice(0, 7)}-${String(day).padStart(2, "0")}`; const stats = calendarDays[date]; const selected = selectedDate === date; return <Pressable key={date} onPress={() => void loadCalendar(date)} style={{ width: "14.28%", height: 46, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.primarySoft : "transparent", borderRadius: 12 }}><Text style={{ color: selected ? colors.primary : colors.text, fontWeight: selected ? "700" : "500" }}>{day}</Text><Text accessibilityLabel={stats ? `${stats.completedTasks} tasks and ${stats.completedHabits} habits completed` : "No recorded activity"} style={{ fontSize: 8, color: stats?.completedTasks || stats?.completedHabits ? colors.success : colors.textFaint }}>{stats?.completedTasks || stats?.completedHabits ? "●" : "·"}</Text></Pressable>; })}</View>}
        {calendarMode !== "month" && <View style={styles.optionRow}>{Array.from({ length: calendarMode === "week" ? 7 : 1 }, (_, index) => { const base = new Date(`${selectedDate}T12:00:00Z`); if (calendarMode === "week") base.setUTCDate(base.getUTCDate() - base.getUTCDay() + index); const date = base.toISOString().slice(0, 10); return <Pressable key={date} onPress={() => void loadCalendar(date)} style={[styles.optionPill, date === selectedDate && styles.optionPillActive]}><Text style={[styles.optionPillText, date === selectedDate && styles.optionPillTextActive]}>{base.toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" })}</Text></Pressable>; })}</View>}
        {calendarDetail?.isFuture && <View style={styles.addRow}><TextInput value={newTask} onChangeText={setNewTask} placeholder={`Plan a task for ${selectedDate}`} placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={addTask} returnKeyType="done" /><Pressable onPress={addTask} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable></View>}        <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>{selectedDate} · {calendarDetail?.isFuture ? "Plan ahead" : "Your day"}</Text>{calendarDetail && <><Text style={[styles.progressTotals, { color: colors.textMuted }]}>{calendarDetail.isFuture ? "Future dates have no completion score." : `${calendarDetail.completedTasks.length} completed tasks · ${calendarDetail.habitCompletionPercent ?? 0}% scheduled habits · ${calendarDetail.xpEarned ?? 0} XP`}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>PLANNED TASKS</Text>{calendarDetail.plannedTasks.length ? calendarDetail.plannedTasks.map((task, i) => <View key={`${task.title}${i}`} style={styles.listItem}><Text style={[styles.itemTitle, { color: colors.text }]}>○  {task.title}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{task.priority.toUpperCase()}</Text></View>) : <Text style={styles.empty}>No tasks planned for this date.</Text>}<Text style={[styles.itemMeta, { marginTop: 16 }]}>COMPLETED ON THIS DATE</Text>{calendarDetail.completedTasks.length ? calendarDetail.completedTasks.map((task, i) => <Text key={`${task.title}${i}`} style={styles.itemTitle}>{task.reversedAt ? "↶" : "✓"}  {task.title}{task.reversedAt ? " · later undone" : ""}</Text>) : <Text style={styles.empty}>No recorded task completions.</Text>}<Text style={[styles.itemMeta, { marginTop: 16 }]}>SCHEDULED HABITS</Text>{calendarDetail.scheduledHabits.length ? calendarDetail.scheduledHabits.map((habit) => <Text key={habit._id} style={styles.itemTitle}>{calendarDetail.completedHabits.some((entry) => entry.habit === habit._id && !entry.reversedAt) ? "✓" : "○"}  {habit.name}</Text>) : <Text style={styles.empty}>No habits scheduled.</Text>}</>}</View>
      </View>}
      {tab === "tasks" && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Your tasks</Text><Pressable onPress={() => setTab("overview")}><Text style={[styles.link, { color: colors.primary }]}>Home · {tasks.filter((t) => t.status !== "done").length} left</Text></Pressable></View>
        {tab === "tasks" && <><TextInput value={taskSearch} onChangeText={setTaskSearch} placeholder="Search tasks" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} /><View style={styles.optionRow}>{(["all", "high", "medium", "low"] as const).map((value) => <Pressable key={value} onPress={() => setTaskPriorityFilter(value)} style={[styles.optionPill, taskPriorityFilter === value && styles.optionPillActive]}><Text style={[styles.optionPillText, taskPriorityFilter === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View></>}        <View style={styles.addRow}><TextInput value={newTask} onChangeText={setNewTask} placeholder={editingTask ? "Edit task title…" : "Add a task…"} placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={addTask} returnKeyType="done" /><Pressable onPress={addTask} style={styles.addButton}><Text style={styles.addButtonText}>{editingTask ? "✓" : "+"}</Text></Pressable>{!!editingTask && <Pressable onPress={resetTaskForm} style={styles.cancelButton}><Text style={styles.cancelText}>×</Text></Pressable>}</View>
        {(tab === "tasks" || !!editingTask) && <View style={styles.formOptions}><View style={styles.optionRow}><Text style={styles.optionLabel}>Priority</Text>{(["low", "medium", "high"] as const).map((value) => <Pressable key={value} onPress={() => setTaskPriority(value)} style={[styles.optionPill, taskPriority === value && styles.optionPillActive]}><Text style={[styles.optionPillText, taskPriority === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><TextInput value={taskPlannedDate} onChangeText={setTaskPlannedDate} placeholder="Plan date (YYYY-MM-DD, optional)" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} autoCapitalize="none" /><TextInput value={taskDueDate} onChangeText={setTaskDueDate} placeholder="Due date (YYYY-MM-DD, optional)" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} autoCapitalize="none" /><TextInput value={taskReminderAt} onChangeText={setTaskReminderAt} placeholder="Reminder (YYYY-MM-DD HH:mm, optional)" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} autoCapitalize="none" /><View style={styles.optionRow}><Text style={styles.optionLabel}>Repeat</Text>{(["none", "daily", "weekly"] as const).map((value) => <Pressable key={value} onPress={() => setTaskRecurrence(value)} style={[styles.optionPill, taskRecurrence === value && styles.optionPillActive]}><Text style={[styles.optionPillText, taskRecurrence === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View>{projects.length > 0 && <View style={styles.optionRow}><Text style={styles.optionLabel}>Project</Text><Pressable onPress={() => setTaskProjectId(null)} style={[styles.optionPill, !taskProjectId && styles.optionPillActive]}><Text style={[styles.optionPillText, !taskProjectId && styles.optionPillTextActive]}>None</Text></Pressable>{projects.map((project) => <Pressable key={project._id} onPress={() => setTaskProjectId(project._id)} style={[styles.optionPill, taskProjectId === project._id && styles.optionPillActive]}><Text style={[styles.optionPillText, taskProjectId === project._id && styles.optionPillTextActive]}>{project.name}</Text></Pressable>)}</View>}{tasks.filter((task) => !task.parentTask && task._id !== editingTask).length > 0 && <View style={styles.optionRow}><Text style={styles.optionLabel}>Subtask of</Text><Pressable onPress={() => setTaskParentId(null)} style={[styles.optionPill, !taskParentId && styles.optionPillActive]}><Text style={[styles.optionPillText, !taskParentId && styles.optionPillTextActive]}>None</Text></Pressable>{tasks.filter((task) => !task.parentTask && task._id !== editingTask).map((task) => <Pressable key={task._id} onPress={() => setTaskParentId(task._id)} style={[styles.optionPill, taskParentId === task._id && styles.optionPillActive]}><Text style={[styles.optionPillText, taskParentId === task._id && styles.optionPillTextActive]}>{task.title}</Text></Pressable>)}</View>}</View>}
        {filteredTasks.length === 0 ? <Text style={styles.empty}>Your task list is a clean slate. Add one small win.</Text> : filteredTasks.map((task) => <View key={task._id} style={styles.listItem}><Pressable onPress={() => toggleTask(task)} style={[styles.check, task.status === "done" && styles.checked]}>{task.status === "done" && <Text style={styles.checkMark}>✓</Text>}</Pressable><Pressable style={styles.itemTextWrap} onPress={() => { setEditingTask(task._id); setNewTask(task.title); setTaskPriority(task.priority); setTaskPlannedDate(task.plannedDate ?? ""); setTaskDueDate(task.dueDate ? localDateOf(task.dueDate, user?.timezone) : ""); setTaskReminderAt(toLocalDateTimeInput(task.reminderAt, user?.timezone)); setTaskRecurrence(task.recurrence ?? "none"); setTaskProjectId(task.project?._id ?? null); setTaskParentId(task.parentTask?._id ?? null); }}><Text style={[styles.itemTitle, { color: colors.text }, task.status === "done" && styles.struck]}>{task.parentTask ? `↳ ${task.title}` : task.title}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{task.priority.toUpperCase()} PRIORITY{task.dueDate ? ` · DUE ${localDateOf(task.dueDate, user?.timezone)}` : ""}{task.project?.name ? ` · ${task.project.name}` : ""} · TAP TO EDIT</Text></Pressable><Pressable onPress={() => deleteTask(task)} accessibilityLabel={`Archive ${task.title}`}><Text style={styles.deleteText}>×</Text></Pressable></View>)}
      </View>}
      {tab === "habits" && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Daily habits</Text><Text style={[styles.sectionCount, { color: colors.textMuted }]}>{completedHabits} completed</Text></View>
        <View style={styles.addRow}><TextInput value={newHabit} onChangeText={setNewHabit} placeholder={editingHabit ? "Edit habit name…" : "Add a daily habit…"} placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={addHabit} returnKeyType="done" /><Pressable onPress={addHabit} style={styles.addButton}><Text style={styles.addButtonText}>{editingHabit ? "✓" : "+"}</Text></Pressable>{!!editingHabit && <Pressable onPress={resetHabitForm} style={styles.cancelButton}><Text style={styles.cancelText}>×</Text></Pressable>}</View>
        {(tab === "habits" || !!editingHabit) && <View style={styles.formOptions}><TextInput value={habitCategory} onChangeText={setHabitCategory} placeholder="Category (Personal)" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} /><View style={styles.optionRow}><Text style={styles.optionLabel}>Difficulty</Text>{(["easy", "medium", "hard"] as const).map((value) => <Pressable key={value} onPress={() => setHabitDifficulty(value)} style={[styles.optionPill, habitDifficulty === value && styles.optionPillActive]}><Text style={[styles.optionPillText, habitDifficulty === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><View style={styles.optionRow}><Text style={styles.optionLabel}>Schedule</Text>{(["daily", "weekly"] as const).map((value) => <Pressable key={value} onPress={() => setHabitFrequency(value)} style={[styles.optionPill, habitFrequency === value && styles.optionPillActive]}><Text style={[styles.optionPillText, habitFrequency === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View>{habitFrequency === "weekly" && <><View style={styles.optionRow}><Text style={styles.optionLabel}>Times per week</Text><Pressable onPress={() => setHabitTarget(Math.max(1, habitTarget - 1))} style={styles.optionPill}><Text style={styles.optionPillText}>−</Text></Pressable><Text style={styles.targetNumber}>{habitTarget}</Text><Pressable onPress={() => setHabitTarget(Math.min(7, habitTarget + 1))} style={styles.optionPill}><Text style={styles.optionPillText}>+</Text></Pressable></View><View style={styles.optionRow}><Text style={styles.optionLabel}>Preferred days</Text>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => <Pressable key={label} onPress={() => setHabitDays((existing) => { const next = existing.includes(day) ? existing.filter((item) => item !== day) : [...existing, day].sort(); if (next.length) setHabitTarget(next.length); return next; })} style={[styles.optionPill, habitDays.includes(day) && styles.optionPillActive]}><Text style={[styles.optionPillText, habitDays.includes(day) && styles.optionPillTextActive]}>{label}</Text></Pressable>)}</View></>}</View>}
        {habits.length === 0 ? <Text style={styles.empty}>Habits compound over time. Start with just one.</Text> : habits.map((habit) => { const done = habit.completions.includes(today(user?.timezone)); return <View key={habit._id} style={styles.listItem}><Pressable onPress={() => toggleHabit(habit)} style={[styles.check, done && styles.checked]}>{done && <Text style={styles.checkMark}>✓</Text>}</Pressable><Pressable style={styles.itemTextWrap} onPress={() => { setEditingHabit(habit._id); setNewHabit(habit.name); setHabitFrequency(habit.frequency); setHabitTarget(habit.targetPerWeek); setHabitDays(habit.daysOfWeek ?? []); setHabitCategory(habit.category ?? "Personal"); setHabitDifficulty(habit.difficulty ?? "medium"); }}><Text style={[styles.itemTitle, { color: colors.text }]}>{habit.icon ?? "•"}  {habit.name}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{(habit.category ?? "PERSONAL").toUpperCase()} · {(habit.difficulty ?? "medium").toUpperCase()} · {habit.frequency.toUpperCase()} HABIT{habit.frequency === "weekly" ? ` · ${habit.targetPerWeek}× / WEEK${habit.daysOfWeek?.length ? ` · ${habit.daysOfWeek.map((day) => ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][day]).join(" ")}` : ""}` : ""} · TAP TO EDIT</Text></Pressable><Pressable onPress={() => void showHabitAnalytics(habit)} accessibilityLabel={`View ${habit.name} analytics`}><Text style={[styles.link, { color: colors.primary }]}>Stats</Text></Pressable><Pressable onPress={() => deleteHabit(habit)} accessibilityLabel={`Archive ${habit.name}`}><Text style={styles.deleteText}>×</Text></Pressable></View>; })}
      </View>}
      {tab === "profile" && <View style={styles.section}><View style={styles.optionRow}>{(["progress", "projects", "goals", "settings"] as const).map((value) => <Pressable key={value} onPress={() => setProfileSection(value)} style={[styles.optionPill, profileSection === value && styles.optionPillActive]}><Text style={[styles.optionPillText, profileSection === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View></View>}
      {tab === "profile" && profileSection === "progress" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Insights</Text><View style={styles.optionRow}>{(["day", "week", "month"] as const).map((value) => <Pressable key={value} onPress={() => setAnalyticsRange(value)} style={[styles.optionPill, analyticsRange === value && styles.optionPillActive]}><Text style={[styles.optionPillText, analyticsRange === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><Text style={[styles.progressTotals, { color: colors.textMuted }]}>{weekly?.totals.tasksCompleted ?? 0} tasks completed · {weekly?.totals.habitCompletions ?? 0} habit check-ins</Text>{weekly?.days.map((day) => { const intensity = Math.min(1, (day.tasksCompleted + day.habitsCompleted) / 6); const date = new Date(`${day.date}T12:00:00Z`); const label = analyticsRange === "day" ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }); return <View key={day.date} style={styles.dayRow}><Text style={styles.dayLabel}>{label}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, intensity * 100)}%` }]} /></View><Text style={styles.dayCount}>{day.tasksCompleted + day.habitsCompleted}</Text></View>; })}</View>}
      {tab === "profile" && profileSection === "progress" && gameSummary && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Challenges & achievements</Text>{gameSummary.challenges.map((challenge) => <View key={challenge.title} style={styles.goalCard}><Text style={[styles.itemTitle, { color: colors.text }]}>{challenge.completed ? "✓  " : "○  "}{challenge.title}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{challenge.description} · {challenge.progress}/{challenge.target}</Text><ProgressBar value={challenge.progress / challenge.target * 100} /></View>)}{gameSummary.achievements.map((achievement) => <View key={achievement.id} style={styles.milestoneRow}><Text style={styles.milestoneMark}>{achievement.unlocked ? "🏅" : "○"}</Text><View><Text style={[styles.itemTitle, { color: colors.text }]}>{achievement.name}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{achievement.description}</Text></View></View>)}</View>}
      {tab === "profile" && profileSection === "goals" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Goals</Text><View style={styles.addRow}><TextInput value={newGoal} onChangeText={setNewGoal} placeholder={editingGoalId ? "Edit goal title…" : "Add a meaningful goal…"} placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={createGoal} returnKeyType="done" /><Pressable onPress={createGoal} style={styles.addButton}><Text style={styles.addButtonText}>{editingGoalId ? "✓" : "+"}</Text></Pressable></View><TextInput value={goalTargetDate} onChangeText={setGoalTargetDate} placeholder="Target date (YYYY-MM-DD, optional)" placeholderTextColor="#727B95" style={[styles.input, styles.optionInput]} autoCapitalize="none" />{goals.length === 0 ? <Text style={styles.empty}>Keep this focused: choose one goal that matters this season.</Text> : goals.map((goal) => <View key={goal._id} style={styles.goalCard}><View style={styles.goalHeader}><Pressable onPress={() => { setEditingGoalId(goal._id); setNewGoal(goal.title); setGoalTargetDate(goal.targetDate ? localDateOf(goal.targetDate, user?.timezone) : ""); }}><Text style={[styles.itemTitle, { color: colors.text }]}>{goal.title}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{goal.targetDate ? `TARGET ${localDateOf(goal.targetDate, user?.timezone)}` : "TAP TITLE TO EDIT"}</Text></Pressable><View style={styles.optionRow}><Pressable onPress={async () => { try { await api(`/goals/${goal._id}`, { method: "PATCH", body: JSON.stringify({ status: goal.status === "completed" ? "active" : "completed" }) }); await loadData(); } catch (e) { showError(e); } }}><Text style={styles.optionPillText}>{goal.status === "completed" ? "Reopen" : "Complete"}</Text></Pressable><Pressable onPress={async () => { try { await api(`/goals/${goal._id}`, { method: "DELETE" }); await loadData(); } catch (e) { showError(e); } }} accessibilityLabel={`Archive ${goal.title}`}><Text style={styles.deleteText}>×</Text></Pressable></View></View>{goal.milestones.map((milestone) => <Pressable key={milestone._id} onPress={() => toggleMilestone(goal, milestone)} style={styles.milestoneRow}><Text style={styles.milestoneMark}>{milestone.completedAt ? "✓" : "○"}</Text><Text style={[styles.itemTitle, { color: colors.text }, milestone.completedAt && styles.struck]}>{milestone.title}</Text></Pressable>)}{milestoneGoalId === goal._id ? <View style={styles.addRow}><TextInput value={newMilestone} onChangeText={setNewMilestone} placeholder="Milestone name" placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={() => addMilestone(goal._id)} /><Pressable onPress={() => addMilestone(goal._id)} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable></View> : <Pressable onPress={() => setMilestoneGoalId(goal._id)} style={styles.addMilestone}><Text style={[styles.link, { color: colors.primary }]}>+ Add milestone</Text></Pressable>}</View>)}</View>}
      {tab === "profile" && profileSection === "projects" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Projects</Text><View style={styles.addRow}><TextInput value={newProject} onChangeText={setNewProject} placeholder={editingProjectId ? "Edit project name…" : "Add a project…"} placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={createProject} returnKeyType="done" /><Pressable onPress={createProject} style={styles.addButton}><Text style={styles.addButtonText}>{editingProjectId ? "✓" : "+"}</Text></Pressable></View>{projects.length === 0 ? <Text style={styles.empty}>Group related tasks when you have a larger outcome to manage.</Text> : projects.map((project) => <View key={project._id} style={styles.listItem}><Pressable style={styles.itemTextWrap} onPress={() => { setEditingProjectId(project._id); setNewProject(project.name); }}><Text style={[styles.itemTitle, { color: colors.text }]}>{project.name}</Text><Text style={[styles.itemMeta, { color: colors.textMuted }]}>{tasks.filter((task) => task.project?._id === project._id).length} TASKS · TAP TO EDIT</Text></Pressable><Pressable onPress={async () => { try { await api(`/projects/${project._id}`, { method: "DELETE" }); await loadData(); } catch (e) { showError(e); } }} accessibilityLabel={`Archive ${project.name}`}><Text style={styles.deleteText}>×</Text></Pressable></View>)}</View>}
      {tab === "profile" && profileSection === "settings" && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>Profile & settings</Text><Text style={styles.optionLabel}>Appearance</Text><View style={styles.optionRow}>{(["system", "light", "dark"] as ThemeMode[]).map((value) => <Pressable key={value} onPress={() => setMode(value)} accessibilityState={{ selected: mode === value }} style={[styles.optionPill, mode === value && styles.optionPillActive]}><Text style={[styles.optionPillText, mode === value && styles.optionPillTextActive]}>{value}</Text></Pressable>)}</View><Text style={styles.optionLabel}>Name</Text><TextInput value={profileName} onChangeText={setProfileName} placeholder="Your name" placeholderTextColor="#727B95" style={styles.input} /><Text style={[styles.optionLabel, { marginTop: 16 }]}>Timezone (IANA name)</Text><TextInput value={profileTimezone} onChangeText={setProfileTimezone} placeholder="e.g. Asia/Kolkata" placeholderTextColor="#727B95" style={styles.input} autoCapitalize="none" /><Text style={[styles.settingsEmail, { color: colors.textMuted }]}>{user.email}</Text><Pressable onPress={saveProfile} style={styles.primary}><Text style={styles.primaryText}>Save profile</Text></Pressable></View>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.footer}>ONE DAY AT A TIME · KEEP GOING</Text>
      </>}
    </ScrollView>
  </AppShell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1020" }, center: { flex: 1, backgroundColor: "#0B1020", alignItems: "center", justifyContent: "center", gap: 14 },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: 56 }, logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center", marginBottom: 20 }, logoText: { color: "#0B1020", fontSize: 28, fontWeight: "900" },
  brand: { color: "#A5B4FC", letterSpacing: 3, fontSize: 12, fontWeight: "800", marginBottom: 30 }, heading: { color: "#F4F6FF", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginBottom: 8 }, muted: { color: "#929BB4", fontSize: 14, lineHeight: 22 }, input: { backgroundColor: "#151C30", borderColor: "#29324A", borderWidth: 1, borderRadius: 14, color: "#F4F6FF", paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, marginTop: 14 },
  primary: { backgroundColor: "#A5B4FC", borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 16, marginTop: 22, minHeight: 54 }, primaryText: { color: "#0B1020", fontWeight: "800", fontSize: 15 }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, switchAuth: { alignItems: "center", marginTop: 22 }, link: { color: "#C7D2FE", fontWeight: "700" }, error: { color: "#FDA4AF", marginTop: 12, lineHeight: 20 }, success: { color: "#86EFAC", marginTop: 12, lineHeight: 20 }, offlineNotice: { color: "#FCD34D", fontSize: 12, padding: 12, backgroundColor: "#2A2518", borderRadius: 12, lineHeight: 18 },
  page: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 42, maxWidth: 1200, width: "100%", alignSelf: "center" }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }, brandSmall: { color: "#A5B4FC", letterSpacing: 2, fontSize: 10, fontWeight: "900", marginBottom: 7 }, greeting: { color: "#F4F6FF", fontSize: 25, fontWeight: "800", letterSpacing: -0.6 }, logout: { borderColor: "#303A54", borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 }, logoutText: { color: "#B7C0D7", fontSize: 12, fontWeight: "700" },
  hero: { backgroundColor: "#1B2440", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#2D3A60", overflow: "hidden" }, eyebrow: { color: "#B8C3FF", letterSpacing: 2, fontSize: 9, fontWeight: "900", marginBottom: 12 }, heroTitle: { color: "#F4F6FF", fontSize: 31, fontWeight: "900", lineHeight: 35, letterSpacing: -1 }, heroSub: { color: "#AEB9D6", fontSize: 13, lineHeight: 20, marginTop: 12 }, heroStats: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 24, paddingTop: 18, borderTopColor: "#394666", borderTopWidth: 1 }, statNumber: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" }, statLabel: { color: "#AEB9D6", fontSize: 11, marginTop: 4 }, statDivider: { width: 1, height: 34, backgroundColor: "#394666" },
  tabs: { backgroundColor: "#131A2D", borderRadius: 13, padding: 4, marginTop: 22, marginBottom: 6, maxHeight: 44 }, tabContent: { flexDirection: "row", gap: 3 }, tab: { minWidth: 64, alignItems: "center", paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10 }, activeTab: { backgroundColor: "#293456" }, tabText: { color: "#8F9AB5", fontSize: 12, fontWeight: "700" }, activeTabText: { color: "#DDE2FF" }, section: { marginTop: 22 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, sectionTitle: { color: "#F4F6FF", fontSize: 19, fontWeight: "800", letterSpacing: -0.4 }, sectionCount: { color: "#929BB4", fontSize: 11 }, addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }, addInput: { flex: 1, marginTop: 0, paddingVertical: 12 }, addButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center" }, addButtonText: { color: "#0B1020", fontSize: 26, fontWeight: "500", marginTop: -2 },
  empty: { color: "#78839F", fontSize: 13, lineHeight: 20, paddingVertical: 18, paddingHorizontal: 4 }, listItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#11182A", borderColor: "#202A42", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8 }, check: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: "#586482", alignItems: "center", justifyContent: "center" }, checked: { backgroundColor: "#A5B4FC", borderColor: "#A5B4FC" }, checkMark: { color: "#0B1020", fontSize: 14, fontWeight: "900" }, itemTextWrap: { flex: 1 }, itemTitle: { color: "#E8EBF7", fontSize: 14, fontWeight: "600" }, struck: { textDecorationLine: "line-through", color: "#8792AE" }, itemMeta: { color: "#7985A3", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 5 }, chevron: { color: "#7F8BA8", fontSize: 20 }, deleteText: { color: "#FDA4AF", fontSize: 22, paddingHorizontal: 4 }, cancelButton: { width: 40, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#202A42" }, cancelText: { color: "#DDE2FF", fontSize: 24 }, formOptions: { padding: 12, backgroundColor: "#11182A", borderRadius: 14, gap: 10, marginBottom: 8 }, optionRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }, optionLabel: { color: "#929BB4", fontSize: 12, width: 100 }, optionPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: "#202A42" }, optionPillActive: { backgroundColor: "#A5B4FC" }, optionPillText: { color: "#B7C0D7", fontSize: 12, textTransform: "capitalize" }, optionPillTextActive: { color: "#0B1020", fontWeight: "700" }, optionInput: { marginTop: 0, paddingVertical: 10 }, targetNumber: { color: "#F4F6FF", fontSize: 14, minWidth: 20, textAlign: "center" }, progressTotals: { color: "#929BB4", fontSize: 13, marginTop: 8, marginBottom: 18 }, dayRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 7 }, dayLabel: { color: "#929BB4", width: 38, fontSize: 12 }, barTrack: { flex: 1, backgroundColor: "#202A42", borderRadius: 6, height: 12, overflow: "hidden" }, barFill: { height: "100%", backgroundColor: "#A5B4FC", borderRadius: 6 }, dayCount: { color: "#DDE2FF", width: 22, textAlign: "right", fontSize: 12 }, settingsEmail: { color: "#929BB4", fontSize: 13, marginTop: 16 }, goalCard: { backgroundColor: "#11182A", borderColor: "#202A42", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 }, goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, milestoneRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 }, milestoneMark: { color: "#A5B4FC", fontSize: 18 }, addMilestone: { paddingTop: 8 }, footer: { color: "#56617B", fontSize: 9, letterSpacing: 2, fontWeight: "800", textAlign: "center", marginTop: 34 }
});
