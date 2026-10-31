import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const NOTIFICATION_IDS_KEY = "hyper_track_task_notification_ids";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function configureNotifications(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("task-reminders", {
      name: "Task reminders", importance: Notifications.AndroidImportance.DEFAULT
    });
  }
}

async function readIds(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, string>; }
  catch { return {}; }
}

export async function setTaskReminder(taskId: string, title: string, reminderAt?: string | null): Promise<void> {
  const ids = await readIds();
  const previousId = ids[taskId];
  if (previousId) await Notifications.cancelScheduledNotificationAsync(previousId).catch(() => undefined);
  delete ids[taskId];

  if (reminderAt) {
    const date = new Date(reminderAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a reminder time in the future.");
    const permissions = await Notifications.getPermissionsAsync();
    const granted = permissions.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) throw new Error("Allow notifications in device settings to use task reminders.");
    const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: "Task reminder", body: title, data: { taskId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, ...(Platform.OS === "android" ? { channelId: "task-reminders" } : {}) }
    });
    ids[taskId] = identifier;
  }
  await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

export async function ensureTaskReminder(taskId: string, title: string, reminderAt?: string | null): Promise<void> {
  const ids = await readIds();
  if (ids[taskId] || !reminderAt) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await setTaskReminder(taskId, title, reminderAt);
}

export async function clearTaskReminder(taskId: string): Promise<void> {
  const ids = await readIds();
  if (ids[taskId]) await Notifications.cancelScheduledNotificationAsync(ids[taskId]).catch(() => undefined);
  delete ids[taskId];
  await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

export async function clearAllTaskReminders(): Promise<void> {
  const ids = await readIds();
  await Promise.all(Object.values(ids).map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined)));
  await AsyncStorage.removeItem(NOTIFICATION_IDS_KEY);
}
