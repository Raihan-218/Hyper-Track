import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, useAppTheme } from "../theme/theme";

export type AppDestination = "overview" | "tasks" | "calendar" | "habits" | "profile";
const destinations: Array<{ id: AppDestination; label: string; glyph: string }> = [
  { id: "overview", label: "Home", glyph: "⌂" },
  { id: "tasks", label: "Tasks", glyph: "☷" },
  { id: "calendar", label: "Calendar", glyph: "▦" },
  { id: "habits", label: "Habits", glyph: "↗" },
  { id: "profile", label: "More", glyph: "•••" },
];

export function AppNavigation({ active, onSelect, name, email }: { active: AppDestination; onSelect: (destination: AppDestination) => void; name: string; email: string }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const wide = width >= 960;
  const item = (destination: typeof destinations[number], compact = false) => {
    const selected = active === destination.id;
    return <Pressable key={destination.id} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={destination.label}
      onPress={() => onSelect(destination.id)} style={({ pressed }) => [compact ? styles.mobileItem : styles.sideItem, { backgroundColor: selected ? colors.primarySoft : "transparent", opacity: pressed ? 0.72 : 1 }]}>
      <Text style={[styles.glyph, { color: selected ? colors.primary : colors.textMuted }]}>{destination.glyph}</Text>
      <Text style={[compact ? styles.mobileLabel : styles.sideLabel, { color: selected ? colors.primary : colors.textMuted }]}>{destination.label}</Text>
    </Pressable>;
  };
  if (wide) return <View style={[styles.sidebar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.brand}><View style={[styles.logo, { backgroundColor: colors.primary }]}><Text style={[styles.logoText, { color: colors.onPrimary }]}>H</Text></View><View><Text style={[styles.brandTitle, { color: colors.text }]}>Hyper Track</Text><Text style={[styles.brandCaption, { color: colors.textFaint }]}>MAKE EVERY DAY COUNT</Text></View></View>
    <Text style={[styles.groupLabel, { color: colors.textFaint }]}>WORKSPACE</Text>{destinations.slice(0, 4).map((entry) => item(entry))}
    <Text style={[styles.groupLabel, { color: colors.textFaint, marginTop: spacing.xl }]}>PERSONAL</Text>{item(destinations[4])}
    <View style={[styles.account, { borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{name.trim().charAt(0).toUpperCase() || "U"}</Text></View><View style={styles.accountCopy}><Text numberOfLines={1} style={[styles.accountName, { color: colors.text }]}>{name}</Text><Text numberOfLines={1} style={[styles.accountEmail, { color: colors.textMuted }]}>{email}</Text></View></View>
  </View>;
  return <View style={[styles.mobileNav, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>{destinations.map((entry) => item(entry, true))}</View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 248, height: "100%", borderRightWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xxxl },
  logo: { width: 38, height: 38, borderRadius: radii.md, alignItems: "center", justifyContent: "center" }, logoText: { fontSize: 21, fontWeight: "900" },
  brandTitle: { fontSize: 16, fontWeight: "800" }, brandCaption: { fontSize: 8, letterSpacing: 1.4, marginTop: 3, fontWeight: "700" },
  groupLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginBottom: spacing.sm, marginLeft: spacing.sm },
  sideItem: { minHeight: 42, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.md, flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: 2 },
  glyph: { width: 22, textAlign: "center", fontSize: 18, fontWeight: "700" }, sideLabel: { fontSize: 13, fontWeight: "600" },
  account: { marginTop: "auto", borderTopWidth: 1, paddingTop: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }, avatarText: { fontWeight: "800" }, accountCopy: { flex: 1 }, accountName: { fontSize: 12, fontWeight: "700" }, accountEmail: { fontSize: 10, marginTop: 2 },
  mobileNav: { minHeight: 60, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  mobileItem: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.md, gap: 1 }, mobileLabel: { fontSize: 9, fontWeight: "700" },
});
