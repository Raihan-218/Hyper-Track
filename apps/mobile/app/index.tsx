import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../src/lib/api";
import { clearToken, getToken, saveToken } from "../src/lib/auth";

type User = { id: string; name: string; email: string };
type Task = { _id: string; title: string; status: "todo" | "in_progress" | "done"; priority: "low" | "medium" | "high" };
type Habit = { _id: string; name: string; frequency: "daily" | "weekly"; targetPerWeek: number; completions: string[] };
type AuthResponse = { user: User; token: string };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newHabit, setNewHabit] = useState("");
  const [tab, setTab] = useState<"overview" | "tasks" | "habits">("overview");
  const [error, setError] = useState("");

  async function loadData() {
    const [taskData, habitData] = await Promise.all([
      api<{ tasks: Task[] }>("/tasks"), api<{ habits: Habit[] }>("/habits")
    ]);
    setTasks(taskData.tasks); setHabits(habitData.habits);
  }

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const result = await api<{ user: User }>("/auth/me");
          setUser(result.user);
          await loadData();
        }
      } catch { await clearToken(); }
      finally { setLoading(false); }
    })();
  }, []);

  async function submitAuth() {
    setBusy(true); setError("");
    try {
      const result = await api<AuthResponse>(`/auth/${authMode}`, {
        method: "POST", body: JSON.stringify(authMode === "register" ? { name, email, password } : { email, password })
      });
      await saveToken(result.token); setUser(result.user); setPassword(""); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    try { await api("/tasks", { method: "POST", body: JSON.stringify({ title: newTask.trim() }) }); setNewTask(""); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleTask(task: Task) {
    try { await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }) }); await loadData(); }
    catch (e) { showError(e); }
  }

  async function addHabit() {
    if (!newHabit.trim()) return;
    try { await api("/habits", { method: "POST", body: JSON.stringify({ name: newHabit.trim(), frequency: "daily" }) }); setNewHabit(""); await loadData(); }
    catch (e) { showError(e); }
  }

  async function toggleHabit(habit: Habit) {
    const done = habit.completions.includes(today());
    try {
      if (done) await api(`/habits/${habit._id}/completions/${today()}`, { method: "DELETE" });
      else await api(`/habits/${habit._id}/completions`, { method: "POST", body: JSON.stringify({ date: today() }) });
      await loadData();
    } catch (e) { showError(e); }
  }

  function showError(e: unknown) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    if (Platform.OS === "web") setError(message); else Alert.alert("Hyper Track", message);
  }

  async function logout() { await clearToken(); setUser(null); setTasks([]); setHabits([]); }

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
      <Pressable onPress={submitAuth} disabled={busy || !email.trim() || password.length < 8 || (authMode === "register" && name.trim().length < 2)} style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color="#0B1020" /> : <Text style={styles.primaryText}>{authMode === "login" ? "Sign in" : "Create account"}</Text>}
      </Pressable>
      <Pressable onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }} style={styles.switchAuth}>
        <Text style={styles.muted}>{authMode === "login" ? "New here? " : "Already have an account? "}<Text style={styles.link}>{authMode === "login" ? "Create account" : "Sign in"}</Text></Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;

  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const completedHabits = habits.filter((habit) => habit.completions.includes(today())).length;

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <View><Text style={styles.brandSmall}>HYPER TRACK</Text><Text style={styles.greeting}>Hey, {user.name.split(" ")[0]} 👋</Text></View>
        <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR DAY, YOUR PACE</Text>
        <Text style={styles.heroTitle}>Small steps.{"\n"}Real momentum.</Text>
        <Text style={styles.heroSub}>Show up today. Let consistency do the rest.</Text>
        <View style={styles.heroStats}>
          <View><Text style={styles.statNumber}>{completedTasks}/{tasks.length}</Text><Text style={styles.statLabel}>Tasks done</Text></View>
          <View style={styles.statDivider} />
          <View><Text style={styles.statNumber}>{completedHabits}/{habits.length}</Text><Text style={styles.statLabel}>Habits today</Text></View>
        </View>
      </View>
      <View style={styles.tabs}>
        {(["overview", "tasks", "habits"] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}><Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}
      </View>
      {(tab === "overview" || tab === "tasks") && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your tasks</Text><Text style={styles.sectionCount}>{tasks.filter((t) => t.status !== "done").length} left</Text></View>
        <View style={styles.addRow}><TextInput value={newTask} onChangeText={setNewTask} placeholder="Add a task…" placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={addTask} returnKeyType="done" /><Pressable onPress={addTask} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable></View>
        {tasks.length === 0 ? <Text style={styles.empty}>Your task list is a clean slate. Add one small win.</Text> : tasks.slice(0, tab === "overview" ? 4 : undefined).map((task) => <Pressable key={task._id} onPress={() => toggleTask(task)} style={styles.listItem}><View style={[styles.check, task.status === "done" && styles.checked]}>{task.status === "done" && <Text style={styles.checkMark}>✓</Text>}</View><View style={styles.itemTextWrap}><Text style={[styles.itemTitle, task.status === "done" && styles.struck]}>{task.title}</Text><Text style={styles.itemMeta}>{task.priority.toUpperCase()} PRIORITY</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
      </View>}
      {(tab === "overview" || tab === "habits") && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Daily habits</Text><Text style={styles.sectionCount}>{completedHabits} completed</Text></View>
        <View style={styles.addRow}><TextInput value={newHabit} onChangeText={setNewHabit} placeholder="Add a daily habit…" placeholderTextColor="#727B95" style={[styles.input, styles.addInput]} onSubmitEditing={addHabit} returnKeyType="done" /><Pressable onPress={addHabit} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable></View>
        {habits.length === 0 ? <Text style={styles.empty}>Habits compound over time. Start with just one.</Text> : habits.map((habit) => { const done = habit.completions.includes(today()); return <Pressable key={habit._id} onPress={() => toggleHabit(habit)} style={styles.listItem}><View style={[styles.check, done && styles.checked]}>{done && <Text style={styles.checkMark}>✓</Text>}</View><View style={styles.itemTextWrap}><Text style={styles.itemTitle}>{habit.name}</Text><Text style={styles.itemMeta}>{habit.frequency.toUpperCase()} HABIT</Text></View><Text style={styles.chevron}>{done ? "✓" : "○"}</Text></Pressable>; })}
      </View>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.footer}>ONE DAY AT A TIME · KEEP GOING</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1020" }, center: { flex: 1, backgroundColor: "#0B1020", alignItems: "center", justifyContent: "center", gap: 14 },
  authWrap: { flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: 56 }, logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center", marginBottom: 20 }, logoText: { color: "#0B1020", fontSize: 28, fontWeight: "900" },
  brand: { color: "#A5B4FC", letterSpacing: 3, fontSize: 12, fontWeight: "800", marginBottom: 30 }, heading: { color: "#F4F6FF", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginBottom: 8 }, muted: { color: "#929BB4", fontSize: 14, lineHeight: 22 }, input: { backgroundColor: "#151C30", borderColor: "#29324A", borderWidth: 1, borderRadius: 14, color: "#F4F6FF", paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, marginTop: 14 },
  primary: { backgroundColor: "#A5B4FC", borderRadius: 14, alignItems: "center", justifyContent: "center", padding: 16, marginTop: 22, minHeight: 54 }, primaryText: { color: "#0B1020", fontWeight: "800", fontSize: 15 }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, switchAuth: { alignItems: "center", marginTop: 22 }, link: { color: "#C7D2FE", fontWeight: "700" }, error: { color: "#FDA4AF", marginTop: 12, lineHeight: 20 },
  page: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 42, maxWidth: 760, width: "100%", alignSelf: "center" }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }, brandSmall: { color: "#A5B4FC", letterSpacing: 2, fontSize: 10, fontWeight: "900", marginBottom: 7 }, greeting: { color: "#F4F6FF", fontSize: 25, fontWeight: "800", letterSpacing: -0.6 }, logout: { borderColor: "#303A54", borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 }, logoutText: { color: "#B7C0D7", fontSize: 12, fontWeight: "700" },
  hero: { backgroundColor: "#1B2440", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#2D3A60", overflow: "hidden" }, eyebrow: { color: "#B8C3FF", letterSpacing: 2, fontSize: 9, fontWeight: "900", marginBottom: 12 }, heroTitle: { color: "#F4F6FF", fontSize: 31, fontWeight: "900", lineHeight: 35, letterSpacing: -1 }, heroSub: { color: "#AEB9D6", fontSize: 13, lineHeight: 20, marginTop: 12 }, heroStats: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 24, paddingTop: 18, borderTopColor: "#394666", borderTopWidth: 1 }, statNumber: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" }, statLabel: { color: "#AEB9D6", fontSize: 11, marginTop: 4 }, statDivider: { width: 1, height: 34, backgroundColor: "#394666" },
  tabs: { flexDirection: "row", backgroundColor: "#131A2D", borderRadius: 13, padding: 4, marginTop: 22, marginBottom: 6 }, tab: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10 }, activeTab: { backgroundColor: "#293456" }, tabText: { color: "#8F9AB5", fontSize: 12, fontWeight: "700" }, activeTabText: { color: "#DDE2FF" }, section: { marginTop: 22 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, sectionTitle: { color: "#F4F6FF", fontSize: 19, fontWeight: "800", letterSpacing: -0.4 }, sectionCount: { color: "#929BB4", fontSize: 11 }, addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }, addInput: { flex: 1, marginTop: 0, paddingVertical: 12 }, addButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#A5B4FC", alignItems: "center", justifyContent: "center" }, addButtonText: { color: "#0B1020", fontSize: 26, fontWeight: "500", marginTop: -2 },
  empty: { color: "#78839F", fontSize: 13, lineHeight: 20, paddingVertical: 18, paddingHorizontal: 4 }, listItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#11182A", borderColor: "#202A42", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8 }, check: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: "#586482", alignItems: "center", justifyContent: "center" }, checked: { backgroundColor: "#A5B4FC", borderColor: "#A5B4FC" }, checkMark: { color: "#0B1020", fontSize: 14, fontWeight: "900" }, itemTextWrap: { flex: 1 }, itemTitle: { color: "#E8EBF7", fontSize: 14, fontWeight: "600" }, struck: { textDecorationLine: "line-through", color: "#8792AE" }, itemMeta: { color: "#7985A3", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 5 }, chevron: { color: "#7F8BA8", fontSize: 20 }, footer: { color: "#56617B", fontSize: 9, letterSpacing: 2, fontWeight: "800", textAlign: "center", marginTop: 34 }
});
