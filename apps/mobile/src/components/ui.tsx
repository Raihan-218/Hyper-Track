import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewStyle } from "react-native";
import { useAppTheme } from "../theme/theme";

export function AppText({ children, muted = false, size = 15, weight = "regular", style }: { children: ReactNode; muted?: boolean; size?: number; weight?: "regular" | "medium" | "semibold" | "bold"; style?: object }) {
  const { colors } = useAppTheme();
  const fontWeight = weight === "regular" ? "400" : weight === "medium" ? "500" : weight === "semibold" ? "600" : "700";
  return <Text style={[{ color: muted ? colors.textMuted : colors.text, fontSize: size, fontWeight, lineHeight: Math.round(size * 1.45) }, style]}>{children}</Text>;
}

export function AppCard({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }, padded && styles.cardPadded, style]}>{children}</View>;
}

export function AppButton({ children, onPress, variant = "primary", disabled, busy, accessibilityLabel, style }: {
  children: ReactNode; onPress?: PressableProps["onPress"]; variant?: "primary" | "secondary" | "quiet" | "danger"; disabled?: boolean; busy?: boolean; accessibilityLabel?: string; style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  const backgroundColor = variant === "primary" ? colors.primary : variant === "danger" ? colors.dangerSoft : variant === "secondary" ? colors.surfaceMuted : "transparent";
  const foreground = variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.danger : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor, borderColor: variant === "secondary" ? colors.border : "transparent", opacity: disabled || busy ? 0.55 : pressed ? 0.78 : 1 }, style]}>
    {busy ? <ActivityIndicator color={foreground} /> : typeof children === "string" ? <Text style={[styles.buttonText, { color: foreground }]}>{children}</Text> : children}
  </Pressable>;
}

export function AppField({ label, style, ...props }: TextInputProps & { label?: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.fieldWrap}>
    {label ? <AppText size={12} weight="semibold" muted>{label}</AppText> : null}
    <TextInput placeholderTextColor={colors.textFaint} selectionColor={colors.primary}
      style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }, style]} {...props} />
  </View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useAppTheme();
  return <View style={styles.sectionTitleRow}><AppText size={18} weight="bold">{title}</AppText>{action ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>{action}</Text></Pressable> : null}</View>;
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors } = useAppTheme();
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
    <View style={[styles.progressFill, { backgroundColor: color ?? colors.primary, width: `${percent}%` }]} />
  </View>;
}

export function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.pill, { backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted, borderColor: selected ? colors.primary : "transparent" }]}>
    <Text style={{ color: selected ? colors.primary : colors.textMuted, fontWeight: selected ? "700" : "500", fontSize: 13 }}>{label}</Text>
  </Pressable>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}><AppText weight="semibold">{title}</AppText>{detail ? <AppText muted size={13} style={{ marginTop: 3 }}>{detail}</AppText> : null}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardPadded: { padding: 16 },
  button: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 14, fontWeight: "700" },
  fieldWrap: { gap: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  progressTrack: { height: 8, borderRadius: 8, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  empty: { padding: 16, borderRadius: 16, gap: 3 }
});
