import Feather from "@expo/vector-icons/Feather";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as React from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/auth";
import { syncReminderNotifications } from "./src/notifications";
import { type AuthStack, ForgotScreen, LoginScreen, RegisterScreen, ResetScreen } from "./src/screens/AuthScreens";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { HabitsScreen } from "./src/screens/HabitsScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { MoneyScreen } from "./src/screens/MoneyScreen";
import { type NoteEditorParams, NoteEditorScreen, NotesScreen } from "./src/screens/NotesScreens";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { useColors, useIsDark } from "./src/theme";

type RootStack = AuthStack & {
  Tabs: undefined;
  Notes: undefined;
  NoteEditor: NoteEditorParams;
  History: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  Home: "home",
  Tasks: "check-square",
  Money: "credit-card",
  Habits: "target",
  Calendar: "calendar",
};

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS[route.name]} color={color} size={size - 2} />,
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Money" component={MoneyScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
    </Tab.Navigator>
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.background, card: c.card, text: c.foreground, border: c.border, primary: c.primary } };

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: c.background } }}>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Notes" component={NotesScreen} />
            <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
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
    </SafeAreaProvider>
  );
}
