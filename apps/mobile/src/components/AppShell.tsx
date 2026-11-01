import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { useAppTheme } from "../theme/theme";
import { AppNavigation, type AppDestination } from "./AppNavigation";

export function AppShell({ active, onSelect, name, email, children }: {
  active: AppDestination;
  onSelect: (destination: AppDestination) => void;
  name: string;
  email: string;
  children: ReactNode;
}) {
  const wide = useWindowDimensions().width >= 960;
  const { colors } = useAppTheme();
  return <View style={{ flex: 1, flexDirection: wide ? "row" : "column", backgroundColor: colors.background }}>
    {wide && <AppNavigation active={active} onSelect={onSelect} name={name} email={email} />}
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    {!wide && <AppNavigation active={active} onSelect={onSelect} name={name} email={email} />}
  </View>;
}
