import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as React from "react";
import { ActivityIndicator, AppState, Image, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/auth";
import { syncReminderNotifications } from "./src/notifications";
import { type AuthStack, ForgotScreen, LoginScreen, RegisterScreen, ResetScreen, VerifyScreen } from "./src/screens/AuthScreens";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { HabitsScreen } from "./src/screens/HabitsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { MoneyScreen } from "./src/screens/MoneyScreen";
import { type NoteEditorParams, NoteEditorScreen, NotesScreen } from "./src/screens/NotesScreens";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { useColors, useIsDark } from "./src/theme";
import { ConfirmHost } from "./src/ConfirmDialog";
import { FabScrollProvider } from "./src/fabScroll";
import { BlurTargetLayout, BlurTargetsProvider, GlassTabBar } from "./src/GlassTabBar";
import { type GlyphName } from "./src/icons";
import { LoanDetailScreen, type LoanParams, LoansScreen, type LoansParams } from "./src/screens/LoansScreens";
import { NamazScreen } from "./src/screens/NamazScreen";
import { SavingsGoalScreen, type SavingsGoalParams } from "./src/screens/SavingsScreens";
import { MonthlyReportScreen, type MonthlyReportParams } from "./src/screens/MonthlyReportScreen";

type RootStack = AuthStack & {
  Tabs: undefined;
  Notes: undefined;
  NoteEditor: NoteEditorParams;
  History: undefined;
  Settings: undefined;
  Loans: LoansParams;
  Loan: LoanParams;
  SavingsGoal: SavingsGoalParams;
  MonthlyReport: MonthlyReportParams;
};

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, GlyphName> = {
  Home: "squares",
  Tasks: "check-circle",
  Money: "wallet",
  Habits: "flame",
  Namaz: "mosque",
  Calendar: "calendar",
};

function Tabs() {
  return (
    <BlurTargetsProvider>
      <Tab.Navigator
        // Floating glass bar drawn over the screens (src/GlassTabBar.tsx).
        tabBar={(props) => <GlassTabBar {...props} icons={TAB_ICONS} />}
        screenLayout={({ route, children }) => <BlurTargetLayout routeKey={route.key}>{children}</BlurTargetLayout>}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={DashboardScreen} />
        <Tab.Screen name="Tasks" component={TasksScreen} />
        <Tab.Screen name="Money" component={MoneyScreen} />
        <Tab.Screen name="Habits" component={HabitsScreen} />
        <Tab.Screen name="Namaz" component={NamazScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
      </Tab.Navigator>
    </BlurTargetsProvider>
  );
}

function Root() {
  const { ready, user } = useAuth();
  const c = useColors();
  const dark = useIsDark();

  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c.background]);

  // Keep local reminder notifications in sync while signed in.
  React.useEffect(() => {
    if (!user?.id) return;
    syncReminderNotifications();
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncReminderNotifications());
    return () => sub.remove();
  }, [user?.id]);

  if (!ready)
    return (
      // Same look as the launch screen: the wordmark, tinted for light/dark, with a small spinner.
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background, gap: 28 }}>
        <Image source={require("./assets/wordmark.png")} style={{ width: 180, height: 52, tintColor: c.foreground }} resizeMode="contain" accessibilityLabel="Dayora" />
        <ActivityIndicator color={c.mutedForeground} size="small" />
      </View>
    );

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.background, card: c.card, text: c.foreground, border: c.border, primary: c.primary } };

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: c.background } }}
        screenLayout={({ children }) => <FabScrollProvider>{children}</FabScrollProvider>}
      >
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="Loans" component={LoansScreen} />
            <Stack.Screen name="Loan" component={LoanDetailScreen} />
            <Stack.Screen name="SavingsGoal" component={SavingsGoalScreen} />
            <Stack.Screen name="MonthlyReport" component={MonthlyReportScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Verify" component={VerifyScreen} />
            <Stack.Screen name="Forgot" component={ForgotScreen} />
            <Stack.Screen name="Reset" component={ResetScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <ConfirmHost />
    </SafeAreaProvider>
  );
}
