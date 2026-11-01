import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const fontSizes = { caption: 11, small: 13, body: 15, subtitle: 18, title: 24, display: 32 } as const;
export const motion = { fast: 140, normal: 220, slow: 320 } as const;

export type ColorPalette = {
  mode: ResolvedTheme;
  background: string; surface: string; surfaceRaised: string; surfaceMuted: string;
  text: string; textMuted: string; textFaint: string; border: string;
  primary: string; primarySoft: string; onPrimary: string;
  success: string; successSoft: string; warning: string; warningSoft: string;
  danger: string; dangerSoft: string; low: string; medium: string; high: string;
  shadow: string; overlay: string;
};

export const palettes: Record<ResolvedTheme, ColorPalette> = {
  light: {
    mode: "light" as const,
    background: "#F4F6FA", surface: "#FFFFFF", surfaceRaised: "#FFFFFF", surfaceMuted: "#EAF0F7",
    text: "#172033", textMuted: "#64718A", textFaint: "#8490A5", border: "#DCE3EC",
    primary: "#5956D6", primarySoft: "#E8E7FF", onPrimary: "#FFFFFF",
    success: "#17835D", successSoft: "#DDF5E9", warning: "#9A6400", warningSoft: "#FFF1CE",
    danger: "#B64054", dangerSoft: "#FCE5E8", low: "#488C72", medium: "#A46D0A", high: "#B64054",
    shadow: "#101828", overlay: "rgba(17, 24, 39, 0.42)"
  },
  dark: {
    mode: "dark" as const,
    background: "#0A1020", surface: "#121A2B", surfaceRaised: "#182238", surfaceMuted: "#202C43",
    text: "#F3F5FA", textMuted: "#A4B0C4", textFaint: "#7D8AA2", border: "#2A3851",
    primary: "#A8A5FF", primarySoft: "#29294C", onPrimary: "#101326",
    success: "#6DDBA4", successSoft: "#18382F", warning: "#F2C36B", warningSoft: "#3B3020",
    danger: "#FF8B9A", dangerSoft: "#44232D", low: "#6DDBA4", medium: "#F2C36B", high: "#FF8B9A",
    shadow: "#000000", overlay: "rgba(0, 0, 0, 0.58)"
  }
} as const;

export type AppColors = ColorPalette;
type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; colors: AppColors };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const MODE_KEY = "hyper_track_theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") setModeState(saved);
    }).catch(() => undefined).finally(() => setLoaded(true));
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
  };
  const resolved = mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;
  const value = useMemo(() => ({ mode, setMode, colors: palettes[resolved] }), [mode, resolved]);
  if (!loaded) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside ThemeProvider");
  return value;
}
