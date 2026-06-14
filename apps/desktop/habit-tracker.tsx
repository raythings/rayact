// Habit Tracker — raym3 M3 + @rayact/navigation demo
// Screens: Today (habits list), Stats, Settings, AddHabit (stack push)

import '@rayact/shared/material-icons';

import React, { useState } from 'react';
import {
  View, Text, StatusBar, ScrollView,
  Card, Fab, NavigationBar, NavigationBarItem, AppBar,
  Icon, Switch, Slider, Input, Button, Divider,
  IconButton, ProgressIndicator, SegmentedButton,
  useTheme, useSafeAreaInsets, render, setColorSchemePreference, useColorSchemePreference,
  BackHandler,
} from '@rayact/react';
import {
  NavigationContainer, createStackNavigator,
  useNavigation, useIsFocused, StackActions,
} from '@rayact/navigation';

// ─── Store ────────────────────────────────────────────────────────────────────

type Habit = {
  id: number;
  name: string;
  icon: string;
  category: string;
  streak: number;
  completedToday: boolean;
};

const store = {
  habits: [
    { id: 1, name: 'Morning Run',  icon: 'directions_run',   category: 'Health',   streak: 7,  completedToday: false },
    { id: 2, name: 'Meditate',     icon: 'self_improvement', category: 'Mind',     streak: 12, completedToday: true  },
    { id: 3, name: 'Read 30 min',  icon: 'menu_book',        category: 'Mind',     streak: 3,  completedToday: false },
    { id: 4, name: 'Drink Water',  icon: 'water_drop',       category: 'Health',   streak: 21, completedToday: true  },
    { id: 5, name: 'Journal',      icon: 'edit_note',        category: 'Focus',    streak: 5,  completedToday: false },
  ] as Habit[],
  goalCount: 3,
  notificationsEnabled: true,
  nextId: 6,
};

// ─── Shared bottom nav ────────────────────────────────────────────────────────

const TABS = [
  { name: 'Today',    icon: 'today'     },
  { name: 'Stats',    icon: 'bar_chart' },
  { name: 'Settings', icon: 'settings'  },
] as const;

const settingsSectionTitleStyle = (t: ReturnType<typeof useTheme>) => ({
  color: t.primary,
  fontSize: 11,
  marginLeft: 24,
  marginRight: 24,
  marginTop: 26,
  marginBottom: 2,
});

const settingsCardStyle = {
  marginLeft: 16,
  marginRight: 16,
  marginTop: 2,
  marginBottom: 10,
};

const appBarBackground = 0xffffffff;
const appBarTitleColor = 0x1b1b1fff;

function ScreenAppBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const t = useTheme();
  const large = onBack == null;
  return (
    <AppBar
      extendTopPaddingToAppBar
      ignoreSafeAreaView
      variant={large ? 'large' : 'small'}
      title={title}
      style={{ flexShrink: 0, backgroundColor: appBarBackground }}
      titleStyle={{ text: { color: appBarTitleColor } }}
      leading={
        onBack ? (
          <IconButton onPress={onBack}>
            <Icon name="arrow_back" size={24} color={t.onSurface} />
          </IconButton>
        ) : undefined
      }
    />
  );
}

function InsetContent({ children, style }: { children: React.ReactNode; style?: Record<string, unknown> }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function Screen({ children, style }: { children: React.ReactNode; style?: Record<string, unknown> }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, ...style }}>
      {children}
    </View>
  );
}

const BottomNav = React.memo(function BottomNav({
  current,
  onNavigate,
}: {
  current: string;
  onNavigate: (name: string) => void;
}) {
  return (
    <NavigationBar extendBottomPaddingToNavigationBar ignoreSafeAreaView style={{ flexShrink: 0 }}>
      {TABS.map(tab => {
        const sel = current === tab.name;
        return (
          <NavigationBarItem
            key={tab.name}
            label={tab.name}
            selected={sel}
            onPress={() => {
              if (sel) return;
              onNavigate(tab.name);
            }}
          >
            <Icon name={tab.icon} size={24} filled={sel} />
          </NavigationBarItem>
        );
      })}
    </NavigationBar>
  );
});

const MAIN_TAB_NAMES = new Set<string>(TABS.map(t => t.name));

function activeRouteName(state: { routes: { name: string }[]; index: number } | undefined) {
  if (!state) return 'Today';
  return state.routes[state.index]?.name ?? 'Today';
}

// ─── Today ────────────────────────────────────────────────────────────────────

function TodayScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  const isFocused = useIsFocused();
  const [habits, setHabits] = useState(() => [...store.habits]);
  const completed = habits.filter(h => h.completedToday).length;

  React.useEffect(() => {
    if (isFocused) setHabits([...store.habits]);
  }, [isFocused]);

  const lastBack = React.useRef(0);
  React.useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();
      if (now - lastBack.current < 1500) { BackHandler.exitApp(); return true; }
      lastBack.current = now;
      return true;
    });
    return () => sub.remove();
  }, [isFocused]);

  const toggle = (id: number) => {
    const h = store.habits.find(x => x.id === id);
    if (h) h.completedToday = !h.completedToday;
    setHabits([...store.habits]);
  };

  return (
    <Screen>
      <ScreenAppBar title="Habit Tracker" />
      <InsetContent>
      <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 16, flexShrink: 0 }}>

        {/* Progress card */}
        <Card style={{ margin: 8, padding: 20, gap: 8, flexShrink: 0 }}>
          <Text text="Today's Progress" style={{ color: t.onSurface, fontSize: 18 }} />
          <Text
            text={`${completed} of ${habits.length} completed`}
            style={{ color: t.onSurfaceVariant, fontSize: 14 }}
          />
          <ProgressIndicator
            value={habits.length > 0 ? completed / habits.length : 0}
            style={{ marginTop: 4 }}
          />
        </Card>

        {/* Habit list */}
        {habits.map(habit => (
          <Card key={habit.id} style={{ margin: 8, padding: 16, minHeight: 48, flexShrink: 0 }} onPress={() => toggle(habit.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon
                name={habit.icon}
                size={28}
                color={habit.completedToday ? t.primary : t.onSurfaceVariant}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text text={habit.name} style={{ color: t.onSurface, fontSize: 16 }} />
                <Text
                  text={`${habit.category}  ·  ${habit.streak} day streak`}
                  style={{ color: t.onSurfaceVariant, fontSize: 12 }}
                />
              </View>
              <Icon
                name={habit.completedToday ? 'check_circle' : 'radio_button_unchecked'}
                size={24}
                color={habit.completedToday ? t.primary : t.outline}
              />
            </View>
          </Card>
        ))}

        <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      </InsetContent>

      <Fab
        style={{ position: 'absolute', bottom: 116, right: 20 }}
        onPress={() => nav.navigate('AddHabit' as never)}
      >
        <Icon name="add" size={24} color={t.onPrimaryContainer} />
      </Fab>
    </Screen>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatsScreen() {
  const t = useTheme();
  const isFocused = useIsFocused();
  const [habits, setHabits] = useState(() => [...store.habits]);

  React.useEffect(() => {
    if (isFocused) setHabits([...store.habits]);
  }, [isFocused]);

  const maxStreak   = Math.max(1, ...habits.map(h => h.streak));
  const totalDays   = habits.reduce((s, h) => s + h.streak, 0);
  const doneToday   = habits.filter(h => h.completedToday).length;

  return (
    <Screen>
      <ScreenAppBar title="Stats" />
      <InsetContent>
      <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 16, flexShrink: 0 }}>

        {/* Summary row */}
        <View style={{ flexDirection: 'row', gap: 8, margin: 8 }}>
          {[
            { icon: 'local_fire_department', value: maxStreak,  label: 'Best Streak', color: t.tertiary  },
            { icon: 'check_circle',          value: doneToday,  label: 'Done Today',  color: t.primary   },
            { icon: 'timeline',              value: totalDays,  label: 'Total Days',  color: t.secondary },
          ].map(stat => (
            <Card key={stat.label} style={{ flex: 1, padding: 12, alignItems: 'center', gap: 4 }}>
              <Icon name={stat.icon} size={28} color={stat.color} />
              <Text text={String(stat.value)} style={{ color: t.onSurface, fontSize: 26 }} />
              <Text text={stat.label} style={{ color: t.onSurfaceVariant, fontSize: 11 }} />
            </Card>
          ))}
        </View>

        {/* Per-habit streak bars */}
        <View style={{ marginLeft: 16, marginRight: 16 }}>
          <Text
            text="Streaks"
            style={{ color: t.onSurface, fontSize: 16, marginTop: 18, marginBottom: 10 }}
          />
          {habits.map(habit => (
            <View key={habit.id} style={{ marginBottom: 14, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={habit.icon} size={18} color={t.primary} />
                <Text text={habit.name} style={{ color: t.onSurface, fontSize: 14, flex: 1 }} />
                <Text text={`${habit.streak}d`} style={{ color: t.onSurfaceVariant, fontSize: 12 }} />
              </View>
              <ProgressIndicator value={habit.streak / maxStreak} />
            </View>
          ))}
        </View>

        <View style={{ height: 16 }} />
        </View>
      </ScrollView>
      </InsetContent>
    </Screen>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsScreen() {
  const t = useTheme();
  const [notifs, setNotifs]   = useState(store.notificationsEnabled);
  const [goal, setGoal]       = useState(store.goalCount);

  return (
    <Screen>
      <ScreenAppBar title="Settings" />
      <InsetContent>
      <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <View style={{ flexShrink: 0 }}>

        <Text text="APPEARANCE" style={settingsSectionTitleStyle(t)} />
        <Card style={settingsCardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
            <Icon name="dark_mode" size={24} color={t.onSurfaceVariant} />
            <Text text="Dark Mode" style={{ color: t.onSurface, fontSize: 16, flex: 1 }} />
            <Switch checked={t.dark} onPress={() => setColorSchemePreference(t.dark ? 'light' : 'dark')} />
          </View>
        </Card>

        <Text text="NOTIFICATIONS" style={settingsSectionTitleStyle(t)} />
        <Card style={settingsCardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
            <Icon name="notifications" size={24} color={t.onSurfaceVariant} />
            <Text text="Daily Reminders" style={{ color: t.onSurface, fontSize: 16, flex: 1 }} />
            <Switch
              checked={notifs}
              onPress={() => {
                store.notificationsEnabled = !notifs;
                setNotifs(!notifs);
              }}
            />
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
            <Icon name="flag" size={24} color={t.onSurfaceVariant} />
            <Text text={`Daily Goal: ${goal}`} style={{ color: t.onSurface, fontSize: 16, flex: 1 }} />
            <Slider
              value={goal / 10}
              min={0}
              max={1}
              style={{ width: 120 }}
              onValueChange={(v: number) => {
                const g = Math.max(1, Math.round(v * 10));
                store.goalCount = g;
                setGoal(g);
              }}
            />
          </View>
        </Card>

        <Text text="DATA" style={settingsSectionTitleStyle(t)} />
        <Card style={settingsCardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
            <Icon name="delete_sweep" size={24} color={t.error} />
            <Text text="Clear All Habits" style={{ color: t.onSurface, fontSize: 16, flex: 1 }} />
            <Button label="Clear" onPress={() => { store.habits = []; }} />
          </View>
        </Card>

        <View style={{ height: 16 }} />
        </View>
      </ScrollView>
      </InsetContent>
    </Screen>
  );
}

// ─── Add Habit ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Health', 'Mind', 'Focus', 'Creative'] as const;
const CAT_ICONS: Record<string, string> = {
  Health: 'favorite', Mind: 'psychology', Focus: 'center_focus_strong', Creative: 'palette',
};

function AddHabitScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  const isFocused = useIsFocused();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Health');

  React.useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { nav.goBack(); return true; });
    return () => sub.remove();
  }, [isFocused, nav]);

  const save = () => {
    if (!name.trim()) return;
    store.habits.push({
      id: store.nextId++,
      name: name.trim(),
      icon: CAT_ICONS[category] ?? 'star',
      category,
      streak: 0,
      completedToday: false,
    });
    nav.goBack();
  };

  return (
    <Screen>
      <ScreenAppBar title="New Habit" onBack={() => nav.goBack()} />
      <InsetContent>
      <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <View style={{ padding: 16, flexShrink: 0 }}>

        <Text text="Habit name" style={{ color: t.onSurface, fontSize: 14, marginBottom: 8 }} />
        <Input
          value={name}
          placeholder="e.g. Morning Run"
          onChangeText={setName}
          style={{ marginBottom: 24 }}
        />

        <Text text="Category" style={{ color: t.onSurface, fontSize: 14, marginBottom: 8 }} />
        <SegmentedButton style={{ marginBottom: 24 }}>
          {CATEGORIES.map(cat => (
            <SegmentedButton
              key={cat}
              label={cat}
              selected={category === cat}
              onPress={() => setCategory(cat)}
            />
          ))}
        </SegmentedButton>

        <Text text="Preview" style={{ color: t.onSurfaceVariant, fontSize: 12, marginBottom: 8 }} />
        <Card style={{ padding: 16, marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name={CAT_ICONS[category] ?? 'star'} size={28} color={t.primary} />
            <View style={{ gap: 2 }}>
              <Text
                text={name || 'Your new habit'}
                style={{ color: name ? t.onSurface : t.onSurfaceVariant, fontSize: 16 }}
              />
              <Text text={`${category}  ·  0 day streak`} style={{ color: t.onSurfaceVariant, fontSize: 12 }} />
            </View>
          </View>
        </Card>

        <Button label="Create Habit" onPress={save} disabled={!name.trim()} />

        <View style={{ height: 32 }} />
        </View>
      </ScrollView>
      </InsetContent>
    </Screen>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const Stack = createStackNavigator();

function App() {
  const t = useTheme();
  const colorSchemePreference = useColorSchemePreference();
  const navigationRef = React.useRef<{
    getRootState: () => { routes: { name: string }[]; index: number } | undefined;
    navigate: (name: string) => void;
  } | null>(null);
  const [routeName, setRouteName] = React.useState('Today');

  const syncRoute = React.useCallback((state?: { routes: { name: string }[]; index: number }) => {
    setRouteName(activeRouteName(state));
  }, []);

  React.useEffect(() => {
    if (colorSchemePreference === 'system') {
      setColorSchemePreference(t.dark ? 'dark' : 'light');
    }
  }, [colorSchemePreference, t.dark]);

  const navigateTab = React.useCallback((name: string) => {
    navigationRef.current?.dispatch(StackActions.replace(name));
  }, []);

  return (
    <View style={{ flexGrow: 1, backgroundColor: t.surface }}>
      <StatusBar barStyle={t.dark ? 'light' : 'dark'} backgroundColor={appBarBackground} />
      <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <NavigationContainer
          ref={navigationRef as never}
          onStateChange={syncRoute}
          onReady={() => syncRoute(navigationRef.current?.getRootState())}
        >
          <Stack.Navigator
            initialRouteName="Today"
            screenOptions={{ animation: 'none' }}
          >
            <Stack.Screen name="Today"    component={TodayScreen}    />
            <Stack.Screen name="Stats"    component={StatsScreen}    />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="AddHabit"
              component={AddHabitScreen}
              options={{ animation: 'slide_from_bottom', animationDuration: 300 }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
      {MAIN_TAB_NAMES.has(routeName) ? (
        <BottomNav current={routeName} onNavigate={navigateTab} />
      ) : null}
    </View>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(390, 844, 'Habit Tracker');
render(<App />);
