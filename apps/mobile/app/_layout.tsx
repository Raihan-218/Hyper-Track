import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useAppTheme } from "../src/theme/theme";

export default function RootLayout() {
  return <ThemeProvider><ThemedLayout /></ThemeProvider>;
}

function ThemedLayout() {
  const { colors } = useAppTheme();
  return <><StatusBar style={colors.mode === "dark" ? "light" : "dark"} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></>;
}
